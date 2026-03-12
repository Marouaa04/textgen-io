import os
import logging
import jwt
import datetime
from functools import wraps

from flask import Flask, request, jsonify, g, send_from_directory
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
from text_processor import TextProcessor

load_dotenv()

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s [%(levelname)s] %(name)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'change-me-in-production')
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///textgen.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

CORS(app, resources={r"/api/*": {"origins": os.getenv("CORS_ORIGINS", "*")}})

db = SQLAlchemy(app)
processor = TextProcessor()


class User(db.Model):
    __tablename__ = 'users'
    id         = db.Column(db.Integer, primary_key=True)
    name       = db.Column(db.String(120), nullable=False)
    email      = db.Column(db.String(200), unique=True, nullable=False)
    password   = db.Column(db.String(256), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    generations = db.relationship('Generation', backref='user', lazy=True)
    preferences = db.relationship('Preference', backref='user', lazy=True, uselist=False)


class Generation(db.Model):
    __tablename__ = 'generations'
    id         = db.Column(db.Integer, primary_key=True)
    user_id    = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    action     = db.Column(db.String(20), nullable=False)
    input_text = db.Column(db.Text, nullable=False)
    result     = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)


class Preference(db.Model):
    __tablename__ = 'preferences'
    id             = db.Column(db.Integer, primary_key=True)
    user_id        = db.Column(db.Integer, db.ForeignKey('users.id'), unique=True)
    default_action = db.Column(db.String(20), default='generate')
    theme          = db.Column(db.String(20), default='dark')
    char_limit     = db.Column(db.Integer, default=500)
    updated_at     = db.Column(db.DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


ACTION_MAP = {
    'generate': processor.generate_text,
    'rephrase': processor.rephrase_text,
    'grammar':  processor.fix_grammar,
    'script':   processor.generate_script,
}


def make_token(user_id):
    payload = {
        'sub': user_id,
        'iat': datetime.datetime.utcnow(),
        'exp': datetime.datetime.utcnow() + datetime.timedelta(days=30),
    }
    return jwt.encode(payload, app.config['SECRET_KEY'], algorithm='HS256')


def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.headers.get('Authorization', '')
        if not auth.startswith('Bearer '):
            return jsonify({'success': False, 'error': 'Missing token'}), 401
        token = auth.split(' ', 1)[1]
        try:
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
            user = db.session.get(User, data['sub'])
            if not user:
                raise ValueError('User not found')
            g.current_user = user
        except Exception as e:
            return jsonify({'success': False, 'error': f'Invalid token: {e}'}), 401
        return f(*args, **kwargs)
    return decorated


def err(msg, status=400):
    return jsonify({'success': False, 'error': msg}), status


@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory('.', filename)


@app.route('/api/health')
def health():
    return jsonify({'status': 'healthy'}), 200


@app.route('/api/auth/register', methods=['POST'])
def register():
    body     = request.get_json(silent=True) or {}
    name     = body.get('name', '').strip()
    email    = body.get('email', '').strip().lower()
    password = body.get('password', '')

    if not all([name, email, password]):
        return err('Name, email and password are required.')
    if len(password) < 6:
        return err('Password must be at least 6 characters.')
    if User.query.filter_by(email=email).first():
        return err('Email already registered.')

    user = User(name=name, email=email, password=generate_password_hash(password))
    db.session.add(user)
    db.session.flush()

    prefs = Preference(user_id=user.id)
    db.session.add(prefs)
    db.session.commit()

    token = make_token(user.id)
    return jsonify({
        'success': True,
        'token': token,
        'user': {'id': user.id, 'name': user.name, 'email': user.email},
    }), 201


@app.route('/api/auth/login', methods=['POST'])
def login():
    body     = request.get_json(silent=True) or {}
    email    = body.get('email', '').strip().lower()
    password = body.get('password', '')

    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.password, password):
        return err('Invalid email or password.', 401)

    token = make_token(user.id)
    return jsonify({
        'success': True,
        'token': token,
        'user': {'id': user.id, 'name': user.name, 'email': user.email},
    })


@app.route('/api/auth/me', methods=['GET'])
@token_required
def me():
    u = g.current_user
    return jsonify({'success': True, 'user': {'id': u.id, 'name': u.name, 'email': u.email}})


@app.route('/api/process', methods=['POST'])
def process():
    try:
        if not request.is_json:
            return err('Content-Type must be application/json.')

        body = request.get_json(silent=True)
        if body is None:
            return err('Malformed JSON.')

        text   = body.get('text', '').strip()
        action = body.get('action', '').strip().lower()

        if not text:
            return err("'text' is required.")
        if len(text) > 500:
            return err("'text' exceeds 500 characters.")
        if action not in ACTION_MAP:
            return err(f"Invalid action. Use: {', '.join(ACTION_MAP)}.")

        result = ACTION_MAP[action](text)

        user_id = None
        auth = request.headers.get('Authorization', '')
        if auth.startswith('Bearer '):
            try:
                data = jwt.decode(auth.split()[1], app.config['SECRET_KEY'], algorithms=['HS256'])
                user_id = data['sub']
            except Exception:
                pass

        gen = Generation(user_id=user_id, action=action, input_text=text, result=result)
        db.session.add(gen)
        db.session.commit()

        return jsonify({'success': True, 'result': result, 'action': action, 'id': gen.id})

    except Exception as e:
        logger.exception('Unhandled error in /api/process')
        return err(f'Internal error: {e}', 500)


@app.route('/api/history', methods=['GET'])
@token_required
def get_history():
    rows = (Generation.query
            .filter_by(user_id=g.current_user.id)
            .order_by(Generation.created_at.desc())
            .limit(50)
            .all())
    return jsonify({
        'success': True,
        'history': [{
            'id':     row.id,
            'action': row.action,
            'input':  row.input_text,
            'result': row.result,
            'time':   row.created_at.isoformat(),
        } for row in rows]
    })


@app.route('/api/history/<int:gen_id>', methods=['DELETE'])
@token_required
def delete_generation(gen_id):
    row = Generation.query.filter_by(id=gen_id, user_id=g.current_user.id).first()
    if not row:
        return err('Not found.', 404)
    db.session.delete(row)
    db.session.commit()
    return jsonify({'success': True})


@app.route('/api/preferences', methods=['GET'])
@token_required
def get_prefs():
    prefs = g.current_user.preferences
    if not prefs:
        return jsonify({'success': True, 'preferences': {}})
    return jsonify({'success': True, 'preferences': {
        'default_action': prefs.default_action,
        'theme':          prefs.theme,
        'char_limit':     prefs.char_limit,
    }})


@app.route('/api/preferences', methods=['PUT'])
@token_required
def update_prefs():
    body  = request.get_json(silent=True) or {}
    prefs = g.current_user.preferences

    if not prefs:
        prefs = Preference(user_id=g.current_user.id)
        db.session.add(prefs)

    if 'default_action' in body and body['default_action'] in ACTION_MAP:
        prefs.default_action = body['default_action']
    if 'theme' in body and body['theme'] in ('dark', 'light'):
        prefs.theme = body['theme']
    if 'char_limit' in body:
        prefs.char_limit = max(100, min(int(body['char_limit']), 500))

    db.session.commit()
    return jsonify({'success': True, 'message': 'Preferences updated.'})


with app.app_context():
    db.create_all()
    logger.info('Database tables ready.')

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    logger.info(f'Starting TextGen API on port {port}')
    app.run(host='0.0.0.0', port=port, debug=True)

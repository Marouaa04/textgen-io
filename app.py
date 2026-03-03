"""
app.py - Flask API entry point for TextGen.io
Exposes REST endpoints for AI-powered text processing.
"""

import os
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from text_processor import TextProcessor

# ------------------------------------------------------------------
# Bootstrap
# ------------------------------------------------------------------

load_dotenv()

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s [%(levelname)s] %(name)s — %(message)s',
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Allow all origins in development; tighten in production by setting
# the CORS_ORIGINS environment variable, e.g. "https://textgen.io"
allowed_origins = os.getenv("CORS_ORIGINS", "*")
CORS(app, resources={r"/api/*": {"origins": allowed_origins}})

processor = TextProcessor()

# ------------------------------------------------------------------
# Action → method dispatch map
# ------------------------------------------------------------------

ACTION_MAP = {
    "generate": processor.generate_text,
    "rephrase": processor.rephrase_text,
    "grammar":  processor.fix_grammar,
    "script":   processor.generate_script,
}

# ------------------------------------------------------------------
# Helper
# ------------------------------------------------------------------

def error_response(message: str, status: int = 400):
    return jsonify({"success": False, "error": message}), status

# ------------------------------------------------------------------
# Routes
# ------------------------------------------------------------------

@app.route("/")
def index():
    """Root health ping."""
    return jsonify({"message": "TextGen.io API is running"}), 200


@app.route("/api/health", methods=["GET"])
def health():
    """Uptime / readiness probe used by PaaS platforms."""
    return jsonify({"status": "healthy"}), 200


@app.route("/api/process", methods=["POST"])
def process():
    """
    Process text with the requested AI action.

    Expected JSON body:
        {
            "text":   "<input text, max 500 chars>",
            "action": "generate | rephrase | grammar | script"
        }

    Returns:
        {
            "success": true,
            "result":  "<processed text>",
            "action":  "<echoed action>"
        }
    """
    try:
        # --- Parse request ---
        if not request.is_json:
            return error_response("Request must be JSON (Content-Type: application/json).")

        body = request.get_json(silent=True)
        if body is None:
            return error_response("Malformed JSON body.")

        text   = body.get("text", "").strip()
        action = body.get("action", "").strip().lower()

        # --- Validate ---
        if not text:
            return error_response("'text' field is required and cannot be empty.")

        if len(text) > 500:
            return error_response("'text' exceeds the 500-character limit.")

        if action not in ACTION_MAP:
            valid = ", ".join(ACTION_MAP.keys())
            return error_response(f"Invalid action '{action}'. Must be one of: {valid}.")

        # --- Dispatch ---
        logger.info(f"▶ action={action} | text_len={len(text)}")
        handler = ACTION_MAP[action]
        result  = handler(text)

        return jsonify({
            "success": True,
            "result":  result,
            "action":  action,
        }), 200

    except Exception as exc:
        logger.exception("Unhandled error in /api/process")
        return error_response(f"Internal server error: {str(exc)}", status=500)


# ------------------------------------------------------------------
# Entry point
# ------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    logger.info(f"🚀 Starting TextGen.io API on port {port}")
    app.run(host="0.0.0.0", port=port, debug=True)

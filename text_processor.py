import os
import time
import requests
import logging
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class TextProcessor:

    def __init__(self):
        self.api_key = os.getenv("GROQ_API_KEY")
        if not self.api_key:
            logger.warning("GROQ_API_KEY not set — fallback responses will be used.")
        else:
            logger.info("Groq API key loaded.")

        self.model   = "llama3-8b-8192"
        self.api_url = "https://api.groq.com/openai/v1/chat/completions"

    def _call(self, prompt, max_tokens=500):
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": max_tokens,
            "temperature": 0.7,
        }

        for attempt in range(3):
            try:
                response = requests.post(self.api_url, headers=headers, json=payload, timeout=30)

                if response.status_code == 429:
                    wait = 10 * (attempt + 1)
                    logger.warning(f"Rate limited — waiting {wait}s (attempt {attempt + 1}/3)")
                    time.sleep(wait)
                    continue

                if response.status_code == 503:
                    logger.warning("Service unavailable — waiting 5s")
                    time.sleep(5)
                    continue

                response.raise_for_status()
                data = response.json()

                if "choices" in data and len(data["choices"]) > 0:
                    return data["choices"][0]["message"]["content"].strip()

                logger.error(f"Unexpected response format: {data}")
                return None

            except requests.exceptions.Timeout:
                logger.error("Request timed out.")
                return None
            except requests.exceptions.RequestException as e:
                logger.error(f"Request failed: {e}")
                if attempt < 2:
                    time.sleep(5)
                    continue
                return None

        logger.error("All 3 attempts failed.")
        return None

    def _fallback(self, action, context):
        fallbacks = {
            'generate': f"[DEMO] {context} is a fascinating subject that spans multiple disciplines. Researchers and practitioners alike have found that a deep understanding of this topic leads to more informed decisions and innovative solutions.",
            'rephrase': f"[DEMO] Professionally rephrased: {context[:80]}{'...' if len(context) > 80 else ''}",
            'grammar':  f"[DEMO] Corrected: {context}",
            'script':   f"[DEMO]\nINT. SCENE - DAY\n\nNARRATOR (V.O.)\n    {context[:100]}\n\nFADE OUT.",
        }
        return fallbacks.get(action, "[DEMO] Processed text result.")

    def generate_text(self, topic):
        result = self._call(f"Write a detailed paragraph about: {topic}")
        return result if result else self._fallback('generate', topic)

    def rephrase_text(self, text):
        result = self._call(f"Rephrase this text professionally: {text}")
        return result if result else self._fallback('rephrase', text)

    def fix_grammar(self, text):
        result = self._call(f"Fix grammar errors: {text}")
        return result if result else self._fallback('grammar', text)

    def generate_script(self, text):
        result = self._call(f"Convert to script format: {text}")
        return result if result else self._fallback('script', text)

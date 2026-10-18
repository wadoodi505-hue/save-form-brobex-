from http.server import BaseHTTPRequestHandler
import json
import urllib.parse
import urllib.request
import re

def extract_youtube_id(url):
    patterns = [
        r'(?:v=|\/shorts\/|\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})',
        r'^([a-zA-Z0-9_-]{11})$'
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        self.handle_request()

    def do_GET(self):
        self.handle_request()

    def handle_request(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'
            data = json.loads(body) if body else {}

            parsed_path = urllib.parse.urlparse(self.path)
            query_params = urllib.parse.parse_qs(parsed_path.query)

            video_url = data.get('url') or query_params.get('url', [None])[0]

            if not video_url:
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'No URL provided'}).encode('utf-8'))
                return

            video_id = extract_youtube_id(video_url)
            video_info = None

            # Attempt extraction via Piped public API relay
            if video_id:
                piped_instances = [
                    f"https://pipedapi.kavin.rocks/streams/{video_id}",
                    f"https://pipedapi.rhea.dev/streams/{video_id}"
                ]
                for p_url in piped_instances:
                    try:
                        req = urllib.request.Request(p_url, headers={'User-Agent': 'Mozilla/5.0'})
                        with urllib.request.urlopen(req, timeout=4) as response:
                            res_data = json.loads(response.read().decode('utf-8'))
                            video_info = {
                                "title": res_data.get("title", "YouTube Video"),
                                "thumbnail": res_data.get("thumbnailUrl", f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"),
                                "duration": str(res_data.get("duration", "Unknown")),
                                "uploader": res_data.get("uploader", "YouTube"),
                                "formats": [{"format_id": "default", "ext": "mp4", "resolution": "720p"}]
                            }
                            break
                    except Exception:
                        continue

            # Fail-safe metadata construction
            if not video_info:
                video_info = {
                    "title": "YouTube Video",
                    "thumbnail": f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg" if video_id else "",
                    "duration": "Unknown",
                    "uploader": "YouTube",
                    "formats": [{"format_id": "default", "ext": "mp4", "resolution": "720p"}]
                }

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(video_info).encode('utf-8'))

        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
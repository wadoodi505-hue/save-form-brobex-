from http.server import BaseHTTPRequestHandler
import json
import urllib.parse
import yt_dlp

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        self.handle_request()

    def do_GET(self):
        self.handle_request()

    def handle_request(self):
        try:
            # Read request body if present
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'
            data = json.loads(body) if body else {}

            # Parse query parameters as fallback
            parsed_path = urllib.parse.urlparse(self.path)
            query_params = urllib.parse.parse_qs(parsed_path.query)

            url = data.get('url') or query_params.get('url', [None])[0]

            if not url:
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'No URL provided'}).encode('utf-8'))
                return

            # Extract info using yt-dlp
            ydl_opts = {'quiet': True, 'skip_download': True}
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                
                formats = []
                for f in info.get('formats', []):
                    if f.get('ext') == 'mp4' and f.get('url'):
                        formats.append({
                            'format_id': f.get('format_id'),
                            'ext': f.get('ext'),
                            'resolution': f.get('resolution') or f'{f.get("height", "unknown")}p'
                        })

                response_data = {
                    "title": info.get("title"),
                    "duration": info.get("duration"),
                    "thumbnail": info.get("thumbnail"),
                    "formats": formats
                }

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(response_data).encode('utf-8'))

        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
from http.server import BaseHTTPRequestHandler
import json
import urllib.parse
import urllib.request

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        query_params = urllib.parse.parse_qs(parsed_path.query)
        
        video_url = query_params.get('url', [None])[0]
        quality = query_params.get('quality', ['720'])[0]
        
        if not video_url:
            self.send_response(400)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'Missing URL parameter'}).encode('utf-8'))
            return

        try:
            # Proxy request server-side to completely bypass browser CORS restrictions
            payload = json.dumps({
                'url': video_url,
                'videoQuality': quality
            }).encode('utf-8')

            req = urllib.request.Request(
                'https://api.cobalt.tools/api/json',
                data=payload,
                headers={
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'User-Agent': 'BrobexDownloader/1.0'
                },
                method='POST'
            )

            with urllib.request.urlopen(req, timeout=15) as response:
                result = json.loads(response.read().decode('utf-8'))

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode('utf-8'))
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
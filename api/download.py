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
    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        query_params = urllib.parse.parse_qs(parsed_path.query)
        
        video_url = query_params.get('url', [None])[0]
        quality = query_params.get('quality', ['1080'])[0]
        
        if not video_url:
            self.send_response(400)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'Missing URL parameter'}).encode('utf-8'))
            return

        video_id = extract_youtube_id(video_url)
        download_url = None

        # Primary extraction using Piped API instance
        if video_id:
            try:
                piped_url = f"https://pipedapi.kavin.rocks/streams/{video_id}"
                req = urllib.request.Request(piped_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=8) as response:
                    data = json.loads(response.read().decode('utf-8'))
                    video_streams = data.get('videoStreams', [])
                    for stream in video_streams:
                        if stream.get('url') and stream.get('videoOnly') == False:
                            download_url = stream.get('url')
                            break
                    if not download_url and video_streams:
                        download_url = video_streams[0].get('url')
            except Exception:
                pass

        # Fallback extraction using Cobalt API
        if not download_url:
            try:
                payload = json.dumps({'url': video_url, 'videoQuality': quality}).encode('utf-8')
                req = urllib.request.Request(
                    'https://api.cobalt.tools/api/json',
                    data=payload,
                    headers={
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0'
                    },
                    method='POST'
                )
                with urllib.request.urlopen(req, timeout=8) as response:
                    result = json.loads(response.read().decode('utf-8'))
                    if result.get('status') in ['tunnel', 'redirect']:
                        download_url = result.get('url')
                    elif result.get('status') == 'picker':
                        download_url = result.get('picker', [{}])[0].get('url')
            except Exception:
                pass

        if not download_url:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'Could not extract stream URL for this video.'}).encode('utf-8'))
            return

        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({'success': True, 'download_url': download_url}).encode('utf-8'))
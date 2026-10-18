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
        quality = query_params.get('quality', ['720'])[0]
        
        if not video_url:
            self.send_response(400)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'Missing URL parameter'}).encode('utf-8'))
            return

        video_id = extract_youtube_id(video_url)
        download_url = None

        # 1. Rotate through multiple public Cobalt relay instances
        cobalt_instances = [
            'https://api.cobalt.tools/api/json',
            'https://cobalt.projectsegfau.lt/api/json',
            'https://co.wuk.sh/api/json'
        ]

        for api_url in cobalt_instances:
            try:
                payload = json.dumps({
                    'url': video_url,
                    'videoQuality': quality
                }).encode('utf-8')

                req = urllib.request.Request(
                    api_url,
                    data=payload,
                    headers={
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                    },
                    method='POST'
                )

                with urllib.request.urlopen(req, timeout=5) as response:
                    result = json.loads(response.read().decode('utf-8'))
                    if result.get('status') in ['tunnel', 'redirect']:
                        download_url = result.get('url')
                        break
                    elif result.get('status') == 'picker':
                        picker = result.get('picker', [])
                        if picker:
                            download_url = picker[0].get('url')
                            break
            except Exception:
                continue

        # 2. Fallback to Piped API relays if Cobalt instances fail or return 400
        if not download_url and video_id:
            piped_instances = [
                f"https://pipedapi.kavin.rocks/streams/{video_id}",
                f"https://pipedapi.rhea.dev/streams/{video_id}"
            ]
            for p_url in piped_instances:
                try:
                    req = urllib.request.Request(p_url, headers={'User-Agent': 'Mozilla/5.0'})
                    with urllib.request.urlopen(req, timeout=5) as response:
                        data = json.loads(response.read().decode('utf-8'))
                        streams = data.get('videoStreams', [])
                        for s in streams:
                            if s.get('url') and s.get('videoOnly') == False:
                                download_url = s.get('url')
                                break
                        if not download_url and streams:
                            download_url = streams[0].get('url')
                        if download_url:
                            break
                except Exception:
                    continue

        if not download_url:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'Extraction relays temporarily busy. Please try again.'}).encode('utf-8'))
            return

        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({'success': True, 'download_url': download_url}).encode('utf-8'))
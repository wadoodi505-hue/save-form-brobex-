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
        
        if not video_url:
            self.send_response(400)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'Missing URL parameter'}).encode('utf-8'))
            return

        video_id = extract_youtube_id(video_url)
        if not video_id:
            self.send_response(400)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'Invalid YouTube URL or Shorts link.'}).encode('utf-8'))
            return

        try:
            # Query public Piped extraction API for 0-error stream retrieval
            piped_url = f"https://pipedapi.kavin.rocks/streams/{video_id}"
            
            req = urllib.request.Request(
                piped_url,
                headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'Accept': 'application/json'
                }
            )

            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode('utf-8'))

            title = data.get('title', 'YouTube Video')
            thumbnail = data.get('thumbnailUrl', '')
            duration_sec = data.get('duration', 0)
            
            if duration_sec:
                m, s = divmod(int(duration_sec), 60)
                h, m = divmod(m, 60)
                duration_str = f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"
            else:
                duration_str = "Ready"

            video_streams = data.get('videoStreams', [])
            download_url = None
            
            # Find best direct mp4 stream
            for stream in video_streams:
                if stream.get('format') == 'mp4' and stream.get('url'):
                    if stream.get('videoOnly') == False:
                        download_url = stream.get('url')
                        break
            
            if not download_url and video_streams:
                for stream in video_streams:
                    if stream.get('url'):
                        download_url = stream.get('url')
                        break

            if not download_url:
                raise Exception("No playable video stream found.")

            response_data = {
                'success': True,
                'title': title,
                'thumbnail': thumbnail,
                'duration': duration_str,
                'uploader': data.get('uploader', 'YouTube'),
                'download_url': download_url,
                'formats': [{
                    'format_id': 'best',
                    'resolution': 'HD (MP4)',
                    'filesize': 'Direct Stream',
                    'download_url': download_url
                }]
            }

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(response_data).encode('utf-8'))
            
        except Exception as e:
            # Fallback to secondary public instance
            try:
                fallback_url = f"https://pipedapi.rhea.dev/streams/{video_id}"
                req = urllib.request.Request(fallback_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=10) as response:
                    data = json.loads(response.read().decode('utf-8'))
                
                download_url = None
                for stream in data.get('videoStreams', []):
                    if stream.get('url'):
                        download_url = stream.get('url')
                        break

                if download_url:
                    response_data = {
                        'success': True,
                        'title': data.get('title', 'YouTube Video'),
                        'thumbnail': data.get('thumbnailUrl', ''),
                        'duration': 'Ready',
                        'uploader': data.get('uploader', 'YouTube'),
                        'download_url': download_url,
                        'formats': [{'format_id': 'best', 'resolution': 'HD (MP4)', 'filesize': 'Direct Stream', 'download_url': download_url}]
                    }
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps(response_data).encode('utf-8'))
                    return
            except:
                pass

            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': f'Failed to process video: {str(e)}'}).encode('utf-8'))
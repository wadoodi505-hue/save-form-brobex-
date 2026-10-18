from http.server import BaseHTTPRequestHandler
import json
import urllib.parse
import yt_dlp

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Parse query parameters from the URL
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

        try:
            # Extract direct stream URL using yt-dlp
            ydl_opts = {
                'format': 'best[ext=mp4]/best',
                'quiet': True,
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(video_url, download=False)
                direct_url = info.get('url')
                title = info.get('title', 'video')
                duration = info.get('duration', 0)
                thumbnail = info.get('thumbnail', '')
                
                # Fallback to check format list if direct url is missing
                if not direct_url and 'formats' in info:
                    for f in info['formats']:
                        if f.get('ext') == 'mp4' and f.get('url'):
                            direct_url = f['url']
                            break

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            response_data = {
                'success': True,
                'title': title,
                'duration': duration,
                'thumbnail': thumbnail,
                'download_url': direct_url
            }
            self.wfile.write(json.dumps(response_data).encode('utf-8'))
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
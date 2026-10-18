from http.server import BaseHTTPRequestHandler
import json
import urllib.parse
import yt_dlp

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

        try:
            # yt-dlp configured for single-file progressive streams (No ffmpeg needed)
            ydl_opts = {
                'format': '18/best[ext=mp4]/best',
                'quiet': True,
                'no_warnings': True,
                'extractor_args': {
                    'youtube': {
                        'player_client': ['android', 'web']
                    }
                }
            }

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(video_url, download=False)
                
                direct_url = info.get('url')
                title = info.get('title', 'YouTube Video')
                thumbnail = info.get('thumbnail', '')
                duration_sec = info.get('duration', 0)
                uploader = info.get('uploader', 'YouTube')

                # Format duration cleanly
                if duration_sec:
                    m, s = divmod(int(duration_sec), 60)
                    h, m = divmod(m, 60)
                    duration_str = f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"
                else:
                    duration_str = "Available"

                # Fallback format search if direct_url is missing
                if not direct_url and 'formats' in info:
                    for f in info['formats']:
                        if f.get('url') and f.get('ext') == 'mp4' and f.get('vcodec') != 'none' and f.get('acodec') != 'none':
                            direct_url = f['url']
                            break
                    if not direct_url:
                        for f in info['formats']:
                            if f.get('url'):
                                direct_url = f['url']
                                break

                if not direct_url:
                    raise Exception("Could not find a direct downloadable stream for this link.")

            response_data = {
                'success': True,
                'title': title,
                'thumbnail': thumbnail,
                'duration': duration_str,
                'uploader': uploader,
                'download_url': direct_url,
                'formats': [{
                    'format_id': 'best',
                    'resolution': 'MP4 (Standard)',
                    'filesize': 'Direct Stream',
                    'download_url': direct_url
                }]
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
            self.wfile.write(json.dumps({'error': f'Failed to extract link: {str(e)}'}).encode('utf-8'))
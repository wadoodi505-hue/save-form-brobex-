from http.server import BaseHTTPRequestHandler
import json
import urllib.parse
import yt_dlp
import os
import shutil

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
            # Source path inside the Vercel read-only bundle
            source_cookie_path = os.path.join(os.getcwd(), 'server', 'cookies.txt')
            # Destination path inside Vercel's writable /tmp folder
            tmp_cookie_path = '/tmp/cookies.txt'

            ydl_opts = {
                'format': 'best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best',
                'quiet': True,
                'no_warnings': True,
                # Rotate player clients to avoid bot detection
                'extractor_args': {
                    'youtube': {
                        'player_client': ['ios', 'mweb', 'android', 'web']
                    }
                }
            }

            # Copy cookies file to /tmp so yt-dlp can safely read & modify it
            if os.path.exists(source_cookie_path):
                shutil.copyfile(source_cookie_path, tmp_cookie_path)
                ydl_opts['cookiefile'] = tmp_cookie_path

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(video_url, download=False)
                
                direct_url = info.get('url')
                title = info.get('title', 'video')
                thumbnail = info.get('thumbnail', '')
                duration_sec = info.get('duration', 0)
                uploader = info.get('uploader', '')

                if duration_sec:
                    m, s = divmod(int(duration_sec), 60)
                    h, m = divmod(m, 60)
                    duration_str = f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"
                else:
                    duration_str = "N/A"

                formats_list = []
                if 'formats' in info:
                    for f in info['formats']:
                        if f.get('url') and (f.get('ext') == 'mp4' or f.get('vcodec') != 'none'):
                            height = f.get('height') or f.get('format_note') or 'SD'
                            res_label = f"{height}p" if str(height).isdigit() else str(height)
                            filesize_bytes = f.get('filesize') or f.get('filesize_approx')
                            filesize_str = f"{round(filesize_bytes / (1024 * 1024), 1)} MB" if filesize_bytes else "Direct Link"

                            formats_list.append({
                                'format_id': f.get('format_id', 'best'),
                                'resolution': res_label,
                                'fps': f.get('fps'),
                                'filesize': filesize_str,
                                'download_url': f.get('url')
                            })

                if not direct_url and formats_list:
                    direct_url = formats_list[-1]['download_url']

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            response_data = {
                'success': True,
                'title': title,
                'thumbnail': thumbnail,
                'duration': duration_str,
                'uploader': uploader,
                'download_url': direct_url,
                'formats': formats_list if formats_list else [{
                    'format_id': 'best',
                    'resolution': 'HD (MP4)',
                    'filesize': 'Direct Stream',
                    'download_url': direct_url
                }]
            }
            self.wfile.write(json.dumps(response_data).encode('utf-8'))
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
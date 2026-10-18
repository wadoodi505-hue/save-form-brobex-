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
            # yt-dlp options configured specifically to bypass YouTube's "Sign in to confirm you're not a bot" challenge
            ydl_opts = {
                'format': 'best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best',
                'quiet': True,
                'no_warnings': True,
                # Rotate player clients to bypass Vercel datacenter IP bot detection
                'extractor_args': {
                    'youtube': {
                        'player_client': ['ios', 'mweb', 'android', 'web']
                    }
                },
                'http_headers': {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
                    'Accept-Language': 'en-US,en;q=0.9',
                }
            }

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(video_url, download=False)
                
                direct_url = info.get('url')
                title = info.get('title', 'video')
                thumbnail = info.get('thumbnail', '')
                duration_sec = info.get('duration', 0)
                uploader = info.get('uploader', '')

                # Format duration into standard MM:SS or HH:MM:SS
                if duration_sec:
                    m, s = divmod(int(duration_sec), 60)
                    h, m = divmod(m, 60)
                    duration_str = f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"
                else:
                    duration_str = "N/A"

                # Extract available formats for quality selection
                formats_list = []
                if 'formats' in info:
                    for f in info['formats']:
                        # Keep MP4 streams or formats with valid URLs
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

                # Fallback to direct_url if list is empty
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
                    'filesize': 'Optimal',
                    'download_url': direct_url
                }]
            }
            self.wfile.write(json.dumps(response_data).encode('utf-8'))
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            error_msg = str(e)
            if "Sign in to confirm" in error_msg:
                error_msg = "YouTube protected this link. Please try again in a moment or try another video URL."
            self.wfile.write(json.dumps({'error': error_msg}).encode('utf-8'))
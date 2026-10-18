from http.server import BaseHTTPRequestHandler
import json
import urllib.parse
import urllib.request

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
            # Query Cobalt public API to extract the stream safely without ffmpeg or cookies
            api_request_data = json.dumps({
                'url': video_url,
                'videoQuality': '1080'
            }).encode('utf-8')

            req = urllib.request.Request(
                'https://api.cobalt.tools/api/json',
                data=api_request_data,
                headers={
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'User-Agent': 'BrobexDownloader/1.0'
                },
                method='POST'
            )

            with urllib.request.urlopen(req) as response:
                result = json.loads(response.read().decode('utf-8'))

            status = result.get('status')
            download_url = None

            if status in ['tunnel', 'redirect']:
                download_url = result.get('url')
            elif status == 'picker':
                picker_items = result.get('picker', [])
                if picker_items:
                    download_url = picker_items[0].get('url')
            
            if not download_url:
                raise Exception(result.get('text', 'Could not retrieve download link from provider.'))

            response_data = {
                'success': True,
                'title': 'YouTube Media',
                'duration': 'Ready',
                'uploader': 'YouTube',
                'download_url': download_url,
                'formats': [{
                    'format_id': 'best',
                    'resolution': '1080p HD',
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
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': f'Extraction failed: {str(e)}'}).encode('utf-8'))
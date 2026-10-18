from flask import Flask, request, jsonify
import yt_dlp

app = Flask(__name__)

@app.route('/', methods=['POST', 'GET'])
def get_info():
    try:
        data = request.get_json() or {}
        url = data.get('url') or request.args.get('url')
        
        if not url:
            return jsonify({"error": "No URL provided"}), 400

        ydl_opts = {'quiet': True, 'skip_download': True}
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return jsonify({
                "title": info.get("title"),
                "duration": info.get("duration"),
                "thumbnail": info.get("thumbnail"),
                "formats": [{"format_id": f.get("format_id"), "ext": f.get("ext"), "resolution": f.get("resolution")} for f in info.get("formats", []) if f.get("url")]
            })
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run()
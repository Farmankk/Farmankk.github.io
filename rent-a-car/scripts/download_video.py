import sys, os, json, time, subprocess, shutil

def get_ffmpeg_path():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return shutil.which("ffmpeg")

def download_video(url, videos_dir, uploads_dir):
    start_time = time.time()
    video_id = f"blog-video-{int(time.time())}"
    ffmpeg_exe = get_ffmpeg_path()
    
    target_video_pattern = os.path.join(videos_dir, f"{video_id}.%(ext)s")
    
    cmd = [
        sys.executable, "-m", "yt_dlp",
        "--no-playlist",
        "--max-filesize", "100M",
        "--socket-timeout", "30",
        "--js-runtimes", "node",
        "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "-f", "bestvideo[height<=720]+bestaudio/best[height<=720]/best",
        "--write-thumbnail",
        "-o", target_video_pattern
    ]
    
    if ffmpeg_exe:
        cmd.extend(["--ffmpeg-location", ffmpeg_exe, "--recode-video", "mp4"])
        
    cmd.append(url)
    
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    
    video_file = None
    poster_file = None
    
    # Check for downloaded video
    for ext in ["mp4", "webm", "mkv", "mov"]:
        cand = os.path.join(videos_dir, f"{video_id}.{ext}")
        if os.path.exists(cand) and os.path.getsize(cand) > 1024:
            video_file = cand
            break
            
    # Check for downloaded thumbnail
    for ext in ["webp", "jpg", "jpeg", "png"]:
        cand = os.path.join(videos_dir, f"{video_id}.{ext}")
        if os.path.exists(cand) and os.path.getsize(cand) > 500:
            dest_poster = os.path.join(uploads_dir, f"blog-cover-{video_id}.{ext}")
            try:
                shutil.move(cand, dest_poster)
                poster_file = dest_poster
            except Exception:
                poster_file = cand
            break

    # Direct video stream fallback
    clean_url = url.split("?")[0].lower()
    if not video_file and any(clean_url.endswith(x) for x in [".mp4", ".webm", ".mov"]):
        try:
            import requests
            direct_cand = os.path.join(videos_dir, f"{video_id}.mp4")
            with requests.get(url, stream=True, timeout=30, headers={"User-Agent": "Mozilla/5.0"}) as r:
                r.raise_for_status()
                with open(direct_cand, "wb") as f:
                    for chunk in r.iter_content(chunk_size=65536):
                        f.write(chunk)
            if os.path.exists(direct_cand) and os.path.getsize(direct_cand) > 1024:
                video_file = direct_cand
        except Exception:
            pass

    if video_file:
        video_rel = "/uploads/videos/" + os.path.basename(video_file)
        poster_rel = ("/uploads/" + os.path.basename(poster_file)) if poster_file else None
        size_mb = round(os.path.getsize(video_file) / (1024 * 1024), 2)
        
        return {
            "success": True,
            "videoUrl": video_rel,
            "posterUrl": poster_rel,
            "sizeMb": f"{size_mb} MB",
            "timeTaken": f"{round(time.time() - start_time, 1)}s"
        }
    else:
        err = proc.stderr.strip() if proc.stderr else "Download failed. Please check the video link or upload directly."
        err_lines = [l for l in err.split("\n") if "ERROR:" in l]
        clean_err = err_lines[-1].replace("ERROR: ", "") if err_lines else err[:200]
        return {
            "success": False,
            "error": clean_err or "Could not extract video from link."
        }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "URL parameter missing"}))
        sys.exit(1)
        
    url = sys.argv[1].strip()
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    uploads_dir = os.path.join(root_dir, "uploads")
    videos_dir = os.path.join(uploads_dir, "videos")
    
    os.makedirs(videos_dir, exist_ok=True)
    os.makedirs(uploads_dir, exist_ok=True)
    
    res = download_video(url, videos_dir, uploads_dir)
    print(json.dumps(res))

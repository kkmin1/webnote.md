import cv2
import yt_dlp
import os

def download_and_capture(video_url, interval_seconds=60, folder_name="captures"):
    output_folder = os.path.join("captures", folder_name)
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)

    ydl_opts = {
        'format': 'mp4/best',
        'outtmpl': 'temp_video.mp4',
    }

    print("영상을 다운로드 중입니다...")
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([video_url])
        
    print(f"{interval_seconds}초 단위로 캡처를 시작합니다...")
    cap = cv2.VideoCapture("temp_video.mp4")
    fps = cap.get(cv2.CAP_PROP_FPS)

    interval_frames = int(fps * interval_seconds)

    count = 0
    frame_id = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
            
        if frame_id % interval_frames == 0:
            minute = count
            output_path = os.path.join(output_folder, f"capture_{minute}m.jpg")
            cv2.imwrite(output_path, frame)
            print(f"{minute}분 시점 캡처 완료: {output_path}")
            count += 1
            
        frame_id += 1
        
    cap.release()

    if os.path.exists("temp_video.mp4"):
        os.remove("temp_video.mp4")
    print("모든 작업이 완료되었습니다.")

if __name__ == "__main__":
    video_url = input("YouTube URL을 입력하세요: ")
    interval_seconds = int(input("캡처 간격(초)을 입력하세요 (기본값: 60): ") or "60")
    folder_name = input("저장 폴더 이름을 입력하세요: ")
    download_and_capture(video_url, interval_seconds, folder_name)
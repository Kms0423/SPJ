import json

# serviceAccountKey.json 파일 경로
with open("serviceAccountKey.json", "r") as file:
    data = json.load(file)

# JSON 데이터를 한 줄로 변환하며 \n 이스케이프 처리
print(json.dumps(data))


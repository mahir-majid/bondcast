from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.conf import settings
import boto3
from .models import AudioClip
from django.contrib.auth import get_user_model
from dotenv import load_dotenv
import os
from pathlib import Path
import uuid
from datetime import datetime
import base64

User = get_user_model()

# Load environment variables
env_path = Path(__file__).resolve().parent.parent.parent / '.env'

# Remove this in prod!
load_dotenv(env_path)

class RecordingUploadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        audio_file = request.FILES.get("audio")
        recipient_ids = request.data.getlist("to_users[]")  # e.g. ["2", "5", "8"]

        if not audio_file:
            return Response({"error": "No audio file provided"}, status=400)

        if not recipient_ids:
            return Response({"error": "No recipients provided"}, status=400)

        try:
            s3 = boto3.client(
                's3',
                aws_access_key_id=os.getenv("AWS_LOCAL_ACCESS_KEY_ID"),
                aws_secret_access_key=os.getenv("AWS_LOCAL_SECRET_ACCESS_KEY"),
                region_name=os.getenv("AWS_LOCAL_S3_REGION_NAME")
            )

            # Generate a unique key with timestamp and UUID
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            unique_id = str(uuid.uuid4())[:8]  # First 8 characters of UUID
            # Use .webm extension since that's what the browser records in
            key = f"recordings/{request.user.username}/{timestamp}_{unique_id}.webm"
            
            bucket = os.getenv("AWS_LOCAL_STORAGE_BUCKET_NAME")
            
            # Log file details for debugging
            print(f"File name: {audio_file.name}")
            print(f"File size: {audio_file.size}")
            print(f"Content type: {audio_file.content_type}")
            
            s3.upload_fileobj(audio_file, bucket, key)
            s3_url = f"https://{bucket}.s3.amazonaws.com/{key}"
            
            # Log the S3 URL for debugging
            print(f"Generated S3 URL: {s3_url}")
            print(f"Bucket: {bucket}")
            print(f"Key: {key}")

            clip = AudioClip.objects.create(sender=request.user, s3_url=s3_url)
            clip.recipients.add(*recipient_ids)

            return Response({"s3_url": s3_url})
        except Exception as e:
            print(f"Error uploading file: {str(e)}")
            return Response({"error": str(e)}, status=500)

class GetRecordingsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            # Get all recordings where the user is a recipient
            recordings = AudioClip.objects.filter(recipients=request.user).select_related('sender')
            
            # Initialize S3 client
            s3 = boto3.client(
                's3',
                aws_access_key_id=os.getenv("AWS_LOCAL_ACCESS_KEY_ID"),
                aws_secret_access_key=os.getenv("AWS_LOCAL_SECRET_ACCESS_KEY"),
                region_name=os.getenv("AWS_LOCAL_S3_REGION_NAME")
            )
            
            bucket = os.getenv("AWS_LOCAL_STORAGE_BUCKET_NAME")
            
            recordings_data = []
            for recording in recordings:
                # Extract the key from the S3 URL
                key = recording.s3_url.split(f"https://{bucket}.s3.amazonaws.com/")[1]
                
                # Get the file from S3
                response = s3.get_object(Bucket=bucket, Key=key)
                file_content = response['Body'].read()
                
                # Convert the binary data to base64
                audio_data = base64.b64encode(file_content).decode('utf-8')
                
                recordings_data.append({
                    'id': recording.id,
                    'sender': {
                        'id': recording.sender.id,
                        'username': recording.sender.username,
                        'firstname': recording.sender.firstname,
                        'lastname': recording.sender.lastname
                    },
                    'audio_data': audio_data,  # Base64 encoded audio data
                    'created_at': recording.created_at
                })
            
            return Response(recordings_data)
        except Exception as e:
            print(f"Error getting recordings: {str(e)}")
            return Response({"error": str(e)}, status=500)

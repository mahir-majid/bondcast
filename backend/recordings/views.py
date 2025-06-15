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
from rest_framework.decorators import api_view, permission_classes
from django.shortcuts import render

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
            # print(f"File name: {audio_file.name}")
            # print(f"File size: {audio_file.size}")
            # print(f"Content type: {audio_file.content_type}")
            
            s3.upload_fileobj(audio_file, bucket, key)
            s3_url = f"https://{bucket}.s3.amazonaws.com/{key}"
            
            # Log the S3 URL for debugging
            # print(f"Generated S3 URL: {s3_url}")
            # print(f"Bucket: {bucket}")
            # print(f"Key: {key}")

            # Create a recording for the sender (marked as seen)
            sender_clip = AudioClip.objects.create(
                sender=request.user,
                s3_url=s3_url,
                seen=True  # Sender's copy is marked as seen
            )
            sender_clip.recipients.add(request.user)  # Add sender as recipient

            # Create a recording for each recipient (marked as unseen)
            for recipient_id in recipient_ids:
                if int(recipient_id) != request.user.id:  # Skip if recipient is the sender
                    recipient_clip = AudioClip.objects.create(
                        sender=request.user,
                        s3_url=s3_url,
                        seen=False  # Recipients' copies are marked as unseen
                    )
                    recipient_clip.recipients.add(recipient_id)

            return Response({"s3_url": s3_url})
        except Exception as e:
            print(f"Error uploading file: {str(e)}")
            return Response({"error": str(e)}, status=500)

class GetRecordingsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            # Get all recordings where the user is a recipient
            recordings = AudioClip.objects.filter(
                recipients=request.user,
                sender=request.user  # Get recordings where user is both sender and recipient
            ).select_related('sender')
            
            # Also get recordings where user is only a recipient
            received_recordings = AudioClip.objects.filter(
                recipients=request.user
            ).exclude(
                sender=request.user  # Exclude recordings where user is sender
            ).select_related('sender')
            
            # Combine both querysets
            all_recordings = recordings.union(received_recordings)
            
            recordings_data = []
            for recording in all_recordings:
                recordings_data.append({
                    'id': recording.id,
                    'sender': {
                        'id': recording.sender.id,
                        'username': recording.sender.username,
                        'firstname': recording.sender.firstname,
                        'lastname': recording.sender.lastname
                    },
                    'created_at': recording.created_at,
                    'seen': recording.seen
                })
            
            return Response(recordings_data)
        except Exception as e:
            print(f"Error getting recordings: {str(e)}")
            return Response({"error": str(e)}, status=500)

class GetRecordingAudioView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, recording_id):
        try:
            recording = AudioClip.objects.get(id=recording_id)
            # Check if user is either sender or recipient
            if request.user != recording.sender and request.user not in recording.recipients.all():
                return Response({'error': 'Not authorized to access this recording'}, status=403)

            # Initialize S3 client
            s3 = boto3.client(
                's3',
                aws_access_key_id=os.getenv("AWS_LOCAL_ACCESS_KEY_ID"),
                aws_secret_access_key=os.getenv("AWS_LOCAL_SECRET_ACCESS_KEY"),
                region_name=os.getenv("AWS_LOCAL_S3_REGION_NAME")
            )
            
            bucket = os.getenv("AWS_LOCAL_STORAGE_BUCKET_NAME")
            key = recording.s3_url.split(f"https://{bucket}.s3.amazonaws.com/")[1]
            
            # Generate presigned URL that expires in 1 hour
            presigned_url = s3.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': bucket,
                    'Key': key
                },
                ExpiresIn=3600
            )
            
            return Response({'audio_url': presigned_url})
        except AudioClip.DoesNotExist:
            return Response({'error': 'Recording not found'}, status=404)
        except Exception as e:
            print(f"Error getting recording audio: {str(e)}")
            return Response({"error": str(e)}, status=500)

class MarkAsSeenView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        recording_id = request.data.get('recording_id')
        if not recording_id:
            return Response({'error': 'Recording ID is required'}, status=400)
        
        try:
            recording = AudioClip.objects.get(id=recording_id)
            # Check if user is either sender or recipient
            if request.user != recording.sender and request.user not in recording.recipients.all():
                return Response({'error': 'Not authorized to view this recording'}, status=403)
            
            recording.seen = True
            recording.save()
            return Response({'status': 'success'})
        except AudioClip.DoesNotExist:
            return Response({'error': 'Recording not found'}, status=404)
        except Exception as e:
            print(f"Error marking recording as seen: {str(e)}")
            return Response({'error': str(e)}, status=500)

class DeleteRecordingView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, recording_id):
        try:
            recording = AudioClip.objects.get(id=recording_id)
            # Check if user is either sender or recipient
            if request.user != recording.sender and request.user not in recording.recipients.all():
                return Response({'error': 'Not authorized to delete this recording'}, status=403)
            
            # Only delete the S3 file if this is the last copy of the recording
            other_copies = AudioClip.objects.filter(s3_url=recording.s3_url).exclude(id=recording.id)
            if not other_copies.exists():
                # This is the last copy, so we can delete the S3 file
                s3 = boto3.client(
                    's3',
                    aws_access_key_id=os.getenv("AWS_LOCAL_ACCESS_KEY_ID"),
                    aws_secret_access_key=os.getenv("AWS_LOCAL_SECRET_ACCESS_KEY"),
                    region_name=os.getenv("AWS_LOCAL_S3_REGION_NAME")
                )
                
                bucket = os.getenv("AWS_LOCAL_STORAGE_BUCKET_NAME")
                key = recording.s3_url.split(f"https://{bucket}.s3.amazonaws.com/")[1]
                
                # Delete from S3
                s3.delete_object(Bucket=bucket, Key=key)
            
            # Remove the user from recipients 
            recording.recipients.remove(request.user)
            if not recording.recipients.exists():
                recording.delete()  # Delete the recording if no recipients left
        
            return Response({'status': 'success'})
        except AudioClip.DoesNotExist:
            return Response({'error': 'Recording not found'}, status=404)
        except Exception as e:
            return Response({'error': str(e)}, status=500)

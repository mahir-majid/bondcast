# audio/urls.py
from django.urls import path
from .views import RecordingUploadView, GetRecordingsView

urlpatterns = [
    path("upload/", RecordingUploadView.as_view(), name="upload_recording"),
    path("get/", GetRecordingsView.as_view(), name="get_recordings"),
]

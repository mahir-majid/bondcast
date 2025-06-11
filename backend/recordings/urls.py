# audio/urls.py
from django.urls import path
from .views import RecordingUploadView, GetRecordingsView, MarkAsSeenView, DeleteRecordingView

urlpatterns = [
    path("upload/", RecordingUploadView.as_view(), name="upload_recording"),
    path("get/", GetRecordingsView.as_view(), name="get_recordings"),
    path("mark-seen/", MarkAsSeenView.as_view(), name="mark_as_seen"),
    path("delete/<int:recording_id>/", DeleteRecordingView.as_view(), name="delete_recording"),
]

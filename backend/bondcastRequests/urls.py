from django.urls import path  # type: ignore
from .views import (
    CreateBondcastRequestView,
    UpdateBondcastRequestView,
    ListBondcastRequestsView,
    RetrieveBondcastRequestView,
    AcceptBondcastRequestView,
    RejectBondcastRequestView,
    GetPendingBondcastRequestsView,
    UpdateResponseAudioView,
    MarkBondcastRequestSeenView,
    MarkBondcastRequestCompletedView,
    GenerateMoreTopicsView,
    GenerateUserInputTopicView
)

urlpatterns = [
    # Create new bondcast request
    path('create/', CreateBondcastRequestView.as_view(), name='create_bondcast_request'),
    
    # List all bondcast requests for user
    path('list/', ListBondcastRequestsView.as_view(), name='list_bondcast_requests'),
    
    # Get pending bondcast requests count
    path('pending/', GetPendingBondcastRequestsView.as_view(), name='pending_bondcast_requests'),
    
    # Retrieve specific bondcast request
    path('<int:pk>/', RetrieveBondcastRequestView.as_view(), name='retrieve_bondcast_request'),
    
    # Update bondcast request (PATCH)
    path('<int:pk>/update/', UpdateBondcastRequestView.as_view(), name='update_bondcast_request'),
    
    # Accept bondcast request
    path('<int:pk>/accept/', AcceptBondcastRequestView.as_view(), name='accept_bondcast_request'),
    
    # Reject bondcast request
    path('<int:pk>/reject/', RejectBondcastRequestView.as_view(), name='reject_bondcast_request'),
    
    # Update response audio URL
    path('<int:pk>/response-audio/', UpdateResponseAudioView.as_view(), name='update_response_audio'),
    
    # Mark bondcast request as completed
    path('<int:pk>/complete/', MarkBondcastRequestCompletedView.as_view(), name='mark_bondcast_request_completed'),
    
    # Mark bondcast request as seen
    path('mark-seen/', MarkBondcastRequestSeenView.as_view(), name='mark_bondcast_request_seen'),
    
    # Generate more topics
    path('generate-topics/', GenerateMoreTopicsView.as_view(), name='generate_more_topics'),
    
    # Generate topics based on user input
    path('generate-user-topics/', GenerateUserInputTopicView.as_view(), name='generate_user_topics'),
]

class MessageConversation(models.Model):
    participants = models.ManyToManyField(User, related_name='conversations')
    created_at = models.DateTimeField(auto_now_add=True)

class Message(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(User, on_delete=models.CASCADE)
    content = models.TextField(blank=True)  # Optional if it’s just an audio comment
    audio_clip = models.ForeignKey(AudioClip, null=True, blank=True, on_delete=models.SET_NULL, related_name='comments')  # optional
    audio_reply_url = models.URLField(null=True, blank=True)  # if user replies with audio
    timestamp = models.DateTimeField(auto_now_add=True)
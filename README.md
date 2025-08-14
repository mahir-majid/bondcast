**Project Name:** Bondiver - AI-Powered Voice Conversation Platform

**Overview:** Bondiver is an innovative platform that enables users to have AI-powered voice conversations and create shareable audio content called "Bondcasts." The platform features real-time voice-to-text transcription, AI-generated responses, and social networking capabilities. Users can record conversations, receive AI-generated greetings, and share their audio content with friends while building meaningful connections through voice-based interactions.

**Project Structure:**

**Backend:** The backend directory is built using Django and Python. It includes multiple Django apps:
- `users`: Handles user authentication, profiles, and friend management
- `recordings`: Manages audio recordings and Bondcast content
- `bondcastConvos`: Handles real-time voice conversations and AI interactions
- `bondcastRequests`: Manages Bondcast sharing and social features
- `friends`: Handles friend relationships and social connections
- `aiMessages`: Processes AI-generated content and responses

The backend utilizes WebSockets for real-time communication, Redis for caching, and integrates with various AI services for voice processing and response generation.

**Frontend:** The frontend directory is built using Next.js with TypeScript. It includes:
- Modern React components for user interface
- Real-time audio recording and processing capabilities
- Dashboard for managing Bondcasts and conversations
- Social features for connecting with friends
- Responsive design optimized for various devices

**Hosting:** The site is hosted at bondiver.com and utilizes modern cloud infrastructure for scalability and performance.

**SITE URL:** https://bondiver.com

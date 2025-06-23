Set Up Instructions
1. Clone Repository

Frontend Setup

2. In frontend folder, do "npm install" to get all necesserary packages. 

3. In frontend folder, create a .env file and ask a previous developer on the environment variables to set up.
   
4. Do "npm run dev" to run the frontend. If any errors occur, install any remaining required packages.

Backend Setup

5. Set up a virtual environment at the root of your project and activate it

6. In the backend folder, install all required Python packages by running: python -m pip install -r requirements.txt
   
7. Download Docker Desktop and make sure you can run the following command in terminal without any issues: docker run -d --name redis-server -p 6379:6379 redis
   
8. Create a .env file in backend folder and ask a previous developer on the environment variables to set up.
    
9. Do "daphne backend.asgi:application" to run the backend.


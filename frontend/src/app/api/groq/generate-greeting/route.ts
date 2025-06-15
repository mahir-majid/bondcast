import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

export async function POST(request: Request) {
  try {
    const headersList = await headers();
    const token = headersList.get('authorization')?.split(' ')[1];

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user data from your backend
    const userResponse = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/users/validate-jwt/`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!userResponse.ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the time context from the request body
    const timeContext = await request.json();

    // Send the time context to the backend
    const backendUrl = `${process.env.NEXT_PUBLIC_URL}/api/convos/generate-greeting/`;
    
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(timeContext),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Backend response:', errorText);
      throw new Error(`Failed to generate greeting: ${errorText}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error generating greeting:', error);
    return NextResponse.json(
      { error: 'Failed to generate greeting' },
      { status: 500 }
    );
  }
} 
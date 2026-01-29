import { Appointment } from './types';

interface ImportMetaEnv {
  readonly VITE_RESEND_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Browser-compatible email sending using Resend REST API
export const sendBookingNotification = async (appointment: Appointment) => {
  try {
    const sessionDate = new Date(appointment.startTime);
    const formattedDate = sessionDate.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body {
              font-family: 'Arial', sans-serif;
              background-color: #050505;
              color: #f1f5f9;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              background-color: #0a0a0a;
              border: 2px solid #39ff14;
              border-radius: 16px;
              overflow: hidden;
            }
            .header {
              background: linear-gradient(135deg, #000000 0%, #1a1a1a 100%);
              padding: 30px;
              text-align: center;
              border-bottom: 2px solid #39ff14;
            }
            .logo {
              width: 60px;
              height: 60px;
              background-color: #39ff14;
              color: #000;
              border-radius: 12px;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              font-size: 32px;
              font-weight: 900;
              margin-bottom: 15px;
              box-shadow: 0 0 20px rgba(57, 255, 20, 0.5);
            }
            .title {
              font-size: 28px;
              font-weight: 900;
              font-style: italic;
              text-transform: uppercase;
              margin: 0;
              letter-spacing: -0.5px;
            }
            .neon {
              color: #39ff14;
              text-shadow: 0 0 10px #39ff14;
            }
            .subtitle {
              font-size: 10px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 3px;
              color: #64748b;
              margin-top: 5px;
            }
            .content {
              padding: 40px 30px;
            }
            .alert-box {
              background-color: rgba(57, 255, 20, 0.1);
              border: 2px solid #39ff14;
              border-radius: 12px;
              padding: 20px;
              margin-bottom: 30px;
              text-align: center;
            }
            .alert-title {
              font-size: 24px;
              font-weight: 900;
              font-style: italic;
              text-transform: uppercase;
              color: #39ff14;
              margin: 0 0 10px 0;
            }
            .alert-subtitle {
              font-size: 11px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 2px;
              color: #64748b;
            }
            .details-box {
              background-color: #050505;
              border: 1px solid #1e293b;
              border-radius: 12px;
              padding: 25px;
              margin-bottom: 20px;
            }
            .detail-row {
              display: flex;
              justify-content: space-between;
              padding: 12px 0;
              border-bottom: 1px solid #1e293b;
            }
            .detail-row:last-child {
              border-bottom: none;
            }
            .detail-label {
              font-size: 10px;
              text-transform: uppercase;
              color: #64748b;
              font-weight: 700;
            }
            .detail-value {
              font-weight: 700;
              text-transform: uppercase;
              color: #fff;
              text-align: right;
            }
            .session-info {
              text-align: center;
              padding: 20px 0;
              border-top: 1px solid #1e293b;
              border-bottom: 1px solid #1e293b;
              margin: 20px 0;
            }
            .session-duration {
              font-size: 14px;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 2px;
              color: #fff;
            }
            .training-type {
              display: inline-block;
              background-color: rgba(57, 255, 20, 0.1);
              color: #39ff14;
              padding: 8px 16px;
              border-radius: 6px;
              font-size: 10px;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 2px;
              margin-top: 15px;
            }
            .footer {
              background-color: #000;
              padding: 25px;
              text-align: center;
              border-top: 1px solid #1e293b;
            }
            .motto {
              font-size: 13px;
              font-weight: 900;
              font-style: italic;
              color: #39ff14;
              letter-spacing: 3px;
              text-transform: uppercase;
            }
            .timestamp {
              font-size: 9px;
              color: #64748b;
              margin-top: 15px;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">M</div>
              <h1 class="title">
                <span class="neon">MONSTAH</span> PRO
              </h1>
              <p class="subtitle">Titan OS v4.2</p>
            </div>
            
            <div class="content">
              <div class="alert-box">
                <h2 class="alert-title">NEW PACKET DEPLOYED</h2>
                <p class="alert-subtitle">Session Booking Confirmed</p>
              </div>
              
              <div class="details-box">
                <div class="detail-row">
                  <span class="detail-label">Athlete:</span>
                  <span class="detail-value">${appointment.clientName}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Email:</span>
                  <span class="detail-value" style="font-size: 11px;">${appointment.email}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Phone:</span>
                  <span class="detail-value" style="font-size: 11px;">${appointment.phoneNumber}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Session Date:</span>
                  <span class="detail-value" style="font-size: 11px;">${formattedDate}</span>
                </div>
              </div>
              
              <div class="session-info">
                <p class="session-duration">60 MIN SESSION</p>
                <div class="training-type">${appointment.type}</div>
              </div>
            </div>
            
            <div class="footer">
              <p class="motto">INTENSE IS HOW WE TRAIN.</p>
              <p class="timestamp">Sync Source: MONSTAH FITTALK PRO</p>
            </div>
          </div>
        </body>
      </html>
    `;


    // Use local proxy to bypass CORS
    // This routes /api/resend/emails -> https://api.resend.com/emails
    const response = await fetch('/api/resend/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'MONSTAH PRO <onboarding@resend.dev>',
        to: ['monstahgymwear@gmail.com'],
        subject: `🔥 NEW SESSION BOOKED: ${appointment.clientName} - ${appointment.type}`,
        html: emailHtml,
      }),
    });

    // Handle non-JSON responses (like 404 or network errors)
    const contentType = response.headers.get("content-type");
    let data;
    if (contentType && contentType.indexOf("application/json") !== -1) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      console.error('Email send error:', data);
      return { success: false, error: data };
    }

    console.log('✅ Booking notification sent successfully:', data);
    return { success: true, data };
  } catch (error: any) {
    console.error('Failed to send booking notification:', error);
    // Return specific error message instead of empty object
    return {
      success: false,
      error: error.message || 'Unknown network error'
    };
  }
};

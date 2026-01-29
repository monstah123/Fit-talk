# 📧 Email Notifications Setup

## Overview
MONSTAH PRO now automatically sends email notifications to `monstahgymwear@gmail.com` whenever a client books a session!

## How It Works

### When a Booking is Confirmed:
1. **Client books** through voice interaction
2. **You click "Deploy"** in the confirmation modal
3. **Two things happen simultaneously:**
   - ✅ **Email sent instantly** to monstahgymwear@gmail.com with booking details
   - ✅ **Google Calendar** link opens for the client to add to their calendar

### Email Contains:
- 🏋️ Athlete name
- 📧 Email address
- 📱 Phone number
- 📅 Session date & time
- ⏱️ Duration (60 minutes)
- 💪 Training type (e.g., Strength, Cardio, etc.)

## Email Service: Resend

**Provider:** [Resend](https://resend.com)  
**Free Tier:** 100 emails/day, 3,000/month  
**Current Sender:** `onboarding@resend.dev` (Resend's test domain)  
**Implementation:** Direct REST API calls (browser-compatible, no Node.js dependencies)

### To Use Your Own Domain:
1. Go to [resend.com/domains](https://resend.com/domains)
2. Add your domain (e.g., `monstahgymwear.com`)
3. Add the DNS records they provide
4. Update `emailService.ts` line 151:
   ```typescript
   from: 'MONSTAH PRO <bookings@monstahgymwear.com>',
   ```

## Environment Variables

Located in `.env.local`:
```bash
VITE_API_KEY=AIzaSyBG8UN2IAKw5805IutqHND2W3dCW7Fp8jg
VITE_RESEND_API_KEY=re_bAZbqjh2_H2XFFh8AsdUjbKHKDwn7GdiD
```

⚠️ **Security Note:** Never commit `.env.local` to git! It's already in `.gitignore`.

## Testing

1. Run the app: `npm run dev`
2. Book a test session through voice
3. Click "Deploy" when the confirmation modal appears
4. Check your console for: `✅ MONSTAH PRO notified via email`
5. Check `monstahgymwear@gmail.com` inbox

## Troubleshooting

### Email not received?
- Check spam/junk folder
- Verify API key in `.env.local`
- Check browser console for errors
- Ensure you clicked "Deploy" (not "Stash Packet")

### Console shows error?
- Verify Resend API key is valid
- Check network tab for failed requests
- Ensure `resend` package is installed: `npm install resend`

## Files Modified
- `emailService.ts` - Email sending logic
- `App.tsx` - Integrated email notification on booking confirmation
- `.env.local` - Added Resend API key

---

**INTENSE IS HOW WE TRAIN.** 🔥

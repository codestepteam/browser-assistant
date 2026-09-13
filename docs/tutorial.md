# Your first task in ten minutes

[한국어](tutorial.ko.md) · [Guide](guide.md)

## 1. Start the backend

Follow the README: clone, `npm ci`, copy `.env.example` to `.env`, set `OPENAI_API_KEY`, then `npm start`. Leave `SERVER_TOKEN` empty only for this loopback-only walkthrough. Open `http://localhost:8796/demo`.

Expected: a fictional customer table, a compact response bar and a microphone button. No Codestep account is involved.

## 2. Send a text request

Tap **How can I help?** to expand chat. Enter:

> Find Mina, open her profile, and change the note to Follow up Friday. Do not save yet.

The assistant should read the page, fill the search field if needed, click Edit, and fill the note. The dialog remains open. **No saved result should appear yet.**

## 3. Confirm a save

Enter **Save the change.** A confirmation card shows the target and current fields. Click **Confirm and run**. The demo's status should say **Saved for Mina Kim**. This updates fictional in-page data only.

Repeat with a different note and choose **Cancel** to verify cancellation. If you edit the form while the confirmation is open, the old confirmation is rejected.

## 4. Try push-to-talk

Hold the microphone, grant browser permission if requested, and speak. Release to send. The microphone track is muted and detached between holds; the task continues. Tap the response bar to expand history. Use Stop to interrupt further actions.

Use HTTPS or localhost. The included microphone tests are simulated; check your real device separately. Browser permission indicators are controlled by the browser.

## 5. Switch language

In **Assistant connection**, choose 한국어 and click **Connect assistant**. The widget's controls become Korean; the customer website itself stays English. Try “Mina의 수정창을 열어줘.” Language selection controls the assistant, not translation of your host page.

## 6. Check React

Open `/react`. Ask **Change the customer name to Alex and save.** Verify that the controlled React field changes and confirmation is required before the saved status appears. This example uses `<BrowserAssistant>` rather than a script tag.

## 7. Connect your own site

Mount the component once at your application's root or serve `widget.js`. Set `serverUrl`, account-specific `sessionKey`, `locale`, `timeZone`, and a short `siteContext`. Exclude sensitive areas with `data-agent-exclude`.

Before exposing the backend to other users, complete the guide's authenticated gateway example. Keep provider credentials and server tokens out of client code.

## 8. Reproduce the video

The recording script uses the authentication gateway and real AI requests. It never records credentials or edits real customer records.

```sh
# Set SERVER_TOKEN and DEMO_LOGIN_PASSWORD in .env first.
npm start
# Second terminal:
npm run demo:gateway
# Third terminal, with Chromium installed:
npm run record:demo
```

It writes a WebM under `.local/recording/`. When FFmpeg is installed, the script also creates `docs/media/demo.mp4` with a smaller encoding. Model responses and timing vary; the script waits for real visible outcomes and fails on timeout. It does not mock the AI response.

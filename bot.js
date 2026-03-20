const { Client, LocalAuth } = require('whatsapp-web.js');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const YOUR_NUMBER = process.env.YOUR_NUMBER;

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        executablePath: '/usr/bin/chromium',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    }
});

const conversations = {};
let pairingCodeRequested = false;

client.on('qr', async () => {
    if (pairingCodeRequested) return;
    pairingCodeRequested = true;
    try {
        await new Promise(r => setTimeout(r, 15000));
        const code = await client.requestPairingCode(YOUR_NUMBER);
        console.log('========================================');
        console.log('PAIRING CODE:', code);
        console.log('Go to WhatsApp > Linked Devices > Link a Device > Link with phone number instead');
        console.log('========================================');
    } catch (err) {
        console.log('Pairing code error:', err.message);
    }
});

client.on('ready', () => {
    console.log('Bot is running');
});

client.on('status', async (status) => {
    try {
        await status.view();
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
        await status.react('❤️');
    } catch (err) {
        console.log('Status error:', err.message);
    }
});

client.on('message', async (msg) => {
    if (msg.fromMe || msg.from === 'status@broadcast') return;
    if (msg.from.endsWith('@g.us')) return;

    const chatId = msg.from;
    const userMessage = msg.body;

    if (!userMessage) return;

    await new Promise(r => setTimeout(r, 1500 + Math.random() * 2000));

    try {
        if (!conversations[chatId]) conversations[chatId] = [];
        conversations[chatId].push({ role: 'user', content: userMessage });

        if (conversations[chatId].length > 10) {
            conversations[chatId] = conversations[chatId].slice(-10);
        }

        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1000,
            system: `You are a helpful WhatsApp assistant. Keep replies concise and conversational.

If a question is highly technical, legal, medical, or requires personal judgment, reply ONLY with: [FORWARD_TO_OWNER] followed by a one-line summary of what they're asking.

Never reveal you are an AI unless directly asked.`,
            messages: conversations[chatId]
        });

        const reply = response.content[0].text;
        conversations[chatId].push({ role: 'assistant', content: reply });

        if (reply.startsWith('[FORWARD_TO_OWNER]')) {
            const summary = reply.replace('[FORWARD_TO_OWNER]', '').trim();
            await client.sendMessage(YOUR_NUMBER,
                `Message from ${chatId}:\n"${userMessage}"\n\nSummary: ${summary}`
            );
            await msg.reply("Let me check on that and get back to you shortly.");
        } else {
            await msg.reply(reply);
        }

    } catch (err) {
        console.log('Error:', err.message);
        await msg.reply("Sorry, having a moment. Try again.");
    }
});

client.initialize();

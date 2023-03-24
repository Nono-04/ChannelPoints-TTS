// ELEVENLABS PARAMETERS https://beta.elevenlabs.io/
var apiKey = "XXXXXXXXX"; // your elevenlabs api key

// TWITCH PARAMETERS
var channelId = "1234567"; // your twitch channel id

// rewards
var rewards = {
    "AI radd (TTS)": {
        // reward name (must be the same as the reward name in twitch !! case sensitive)
        ttsCharacterLimit: 300, // max characters to send
        type: "elevenlabs", // elevenlabs or streamelements
        voiceId: "XXXXXXXXXXX", // elevenlabs voice id
        volume: 1, // volume 0.0 - 1.0
        stability: 0.3, // elevenlabs stability 0.0 - 1.0
        similarityBoost: 0.8, // elevenlabs similarityBoost 0.0 - 1.0
    },
    "Brian (Normal TTS)": {
        // reward name (must be the same as the reward name in twitch !! case sensitive)
        ttsCharacterLimit: 500, // max characters to send
        type: "streamelements", // streamelements or elevenlabs
        voiceId: "Brian", // streamelements voice id
        volume: 0.35, // volume 0.0 - 1.0
        stability: 0, // does not exist for streamelements
        similarityBoost: 0, // does not exist for streamelements
    },
};



// -----------------
// DEBUG PARAMETERS
// -----------------
var testTTSOnLoad = false; // debug mode to test. true = F5 to play text false = nothing leave this on false if you dont plan to change the code
var testTTS = "Brian (Normal TTS)"; // reward name to test
var testText = "Hello world"; // text to test

function sleep(miliseconds) {
    return new Promise((res) => setTimeout(res, miliseconds));
}

async function textToSpeech(reward, text) {
    const ctx = new AudioContext();

    // Limit text length
    text = text.substring(0, reward["ttsCharacterLimit"]);

    console.log("TTS text:", text);

    let url;
    let requestOptions;
    if (reward["type"] == "elevenlabs") {
        requestOptions = {
            method: "POST",
            headers: {
                "xi-api-key": apiKey,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                text: text,
                voice_settings: {
                    stability: reward["stability"],
                    similarity_boost: reward["similarityBoost"],
                },
            }),
        };
        url = `https://api.elevenlabs.io/v1/text-to-speech/${reward["voiceId"]}`;
    } else if (reward["type"] == "streamelements") {
        url = `https://api.streamelements.com/kappa/v2/speech?voice=${reward["voiceId"]}&text=${text}`;
    } else {
        throw "TTS type not found";
    }

    // fetch() returns a promise that
    // resolves once headers have been received
    var response = await fetch(url, requestOptions);

    var arrayBuffer = await response.arrayBuffer();
    var decodedAudio = await ctx.decodeAudioData(arrayBuffer);
    var gainNode = ctx.createGain();
    gainNode.connect(ctx.destination);
    gainNode.gain.value = reward["volume"];
    const audio = decodedAudio;
    const source = ctx.createBufferSource();
    source.buffer = audio;
    source.connect(gainNode);
    source.start();
    return new Promise((resolve, reject) => {
        source.onended = resolve;
    });
}

window.onload = () => {
    let ws = undefined;
    let pong = false;
    let interval = false;

    let notifications = [];

    (async () => {
        while (true) {
            if (notifications.length > 0) {
                let notif = notifications.pop();
                console.log("Notification started", notif);

                let reward = rewards[notif.title];
                if (reward && notif.text != "") {
                    console.log("Playing TTS");
                    try {
                        await textToSpeech(reward, notif.text);
                        console.log("TTS ended");
                    } catch (e) {
                        console.log("TTS error:", e);
                    }
                }
                console.log("Notification ended");
            }
            await sleep(1000);
        }
    })();

    function connect() {
        ws = new WebSocket("wss://pubsub-edge.twitch.tv");
        listen();
    }
    function disconnect() {
        if (interval) {
            clearInterval(interval);
            interval = false;
        }
        ws.close();
    }

    function listen() {
        ws.onmessage = (a) => {
            let o = JSON.parse(a.data);
            switch (o.type) {
                case "PING":
                    ws.send(
                        JSON.stringify({
                            type: "PONG",
                        })
                    );
                    break;
                case "PONG":
                    pong = true;
                    break;
                case "RECONNECT":
                    disconnect();
                    connect();
                    break;
                case "RESPONCE":
                    console.log("PubSub responce ", o.error);
                    break;
                case "MESSAGE":
                    switch (o.data.topic) {
                        case `community-points-channel-v1.${channelId}`:
                            let msg = JSON.parse(o.data.message);
                            console.log(msg);
                            switch (msg.type) {
                                case "reward-redeemed":
                                    let reward = msg.data.redemption.reward;

                                    let notif = {
                                        title: reward.title,
                                        price: reward.cost,
                                        user: msg.data.redemption.user.display_name,
                                        text: msg.data.redemption.user_input,
                                    };
                                    console.log("Notification queued", notif);
                                    notifications.push(notif);
                                    break;
                            }
                            break;
                    }
                    break;
            }
        };
        ws.onopen = () => {
            if (testTTSOnLoad) {
                let notif = {
                    title: testTTS,
                    price: 5000,
                    user: "test_user",
                    text: testText,
                };
                console.log("Notification queued", notif);
                notifications.push(notif);
            }

            ws.send(
                JSON.stringify({
                    type: "LISTEN",
                    nonce: "pepega",
                    data: {
                        topics: ["community-points-channel-v1." + channelId],
                        auth_token: "",
                    },
                })
            );
            interval = setInterval(async () => {
                ws.send(
                    JSON.stringify({
                        type: "PING",
                    })
                );
                await sleep(5000);
                if (pong) {
                    pong = false;
                } else {
                    pong = false;
                    disconnect();
                    connect();
                }
            }, 5 * 60 * 1000);
        };
    }

    connect();
};

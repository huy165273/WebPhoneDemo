const socket = new JsSIP.WebSocketInterface('wss://34.133.184.106:8443/ws');
const configuration = {
    sockets: [socket],
    uri: 'sip:6504@34.133.184.106',
    password: '123456',
    session_timers: false,
    stun_servers: ['stun:stun.l.google.com:19302']
};

const ua = new JsSIP.UA(configuration);
let currentSession = null;
let mediaRecorder = null;
let recordedChunks = [];
const contacts = {};
const historyList = document.getElementById('historyList');
const contactList = document.getElementById('contactList');

// Kết nối WebSocket
ua.on('connected', () => {
    const status = document.getElementById('status');
    status.textContent = 'Connected';
    status.classList.remove('disconnected');
    status.classList.add('connected');
    console.log('WebSocket connected');
});

// Đăng ký thành công
ua.on('registered', () => {
    console.log('Registered successfully');
});

// Đăng ký thất bại
ua.on('registrationFailed', (e) => {
    const status = document.getElementById('status');
    status.textContent = 'Registration Failed';
    status.classList.remove('connected');
    status.classList.add('disconnected');
    console.error('Registration failed:', e.cause);
});

// Cuộc gọi đến
ua.on('newRTCSession', (data) => {
    if (data.originator === 'remote') {
        currentSession = data.session;

        const caller = data.request.from.display_name || data.request.from.uri.user;
        document.getElementById('incomingNumber').textContent = caller;
        document.getElementById('incomingCall').style.display = 'block';


        if (!contacts[caller]) {
            contacts[caller] = [];
            const li = document.createElement('li');
            li.textContent = caller;
            li.onclick = () => showCallHistory(caller);
            contactList.appendChild(li);
        }

        currentSession.on('ended', () => {
            document.getElementById('incomingCall').style.display = 'none';
            console.log('Call ended');
            stopRecording();
            currentSession = null;
        });

        currentSession.on('failed', () => {
            document.getElementById('incomingCall').style.display = 'none';
            console.log('Call failed');
            stopRecording();
            currentSession = null;
        });

        currentSession.connection?.addEventListener('track', (e) => {
            if (!e.streams || e.streams.length === 0) {
                console.error('No streams available for the track event');
                return;
            }

            const audio = document.createElement('audio');
            audio.srcObject = e.streams[0];
            audio.autoplay = true;
            document.body.appendChild(audio);

            // Bắt đầu ghi âm sau khi track âm thanh được thêm
            startRecording();
        });

        startRecording(); // Bắt đầu ghi âm khi nhận cuộc gọi
    }
});

// Bắt đầu cuộc gọi
function startCall() {
    const target = document.getElementById('sipTarget').value;
    if (!target) {
        alert('Please enter a valid SIP URI');
        return;
    }

    console.log('Calling target:', target);

    currentSession = ua.call(target, {
        mediaConstraints: { audio: true, video: false }
    });

    currentSession.on('ended', () => {
        addCallToHistory(target, 'Outgoing');
        console.log('Call ended');
        stopRecording(); // Tự động dừng ghi âm khi kết thúc cuộc gọi
        currentSession = null;
    });

    currentSession.on('failed', (e) => {
        console.error('Call failed:', e.cause);
        alert('Call failed: ' + e.cause);
        stopRecording(); // Dừng ghi âm nếu cuộc gọi thất bại
        currentSession = null;
    });

    currentSession.connection?.addEventListener('track', (e) => {
        if (!e.streams || e.streams.length === 0) {
            console.error('No streams available for the track event');
            return;
        }

        const audio = document.createElement('audio');
        audio.srcObject = e.streams[0];
        audio.autoplay = true;
        document.body.appendChild(audio);

        // Bắt đầu ghi âm sau khi track âm thanh được thêm
        startRecording();
    });
}

// Chấp nhận cuộc gọi
function acceptCall() {
    if (currentSession) {
        currentSession.answer({ mediaConstraints: { audio: true } });

        currentSession.connection?.addEventListener('track', (e) => {
            if (!e.streams || e.streams.length === 0) {
                console.error('No streams available for the track event');
                return;
            }

            const audio = document.createElement('audio');
            audio.srcObject = e.streams[0];
            audio.autoplay = true;
            document.body.appendChild(audio);

            // Bắt đầu ghi âm sau khi track âm thanh được thêm
            startRecording();
        });

        document.getElementById('incomingCall').style.display = 'none';
        addCallToHistory(document.getElementById('incomingNumber').textContent, 'Incoming');
        console.log('Call accepted');

        currentSession.on('ended', () => {
            stopRecording();
            console.log('Call ended');
            currentSession = null;
        });

        currentSession.on('failed', () => {
            stopRecording();
            console.log('Call failed');
            currentSession = null;
        });
    }
}

// Từ chối cuộc gọi
function rejectCall() {
    if (currentSession) {
        currentSession.terminate();
        document.getElementById('incomingCall').style.display = 'none';
        currentSession = null;
        console.log('Call rejected');
    }
}

// Ghi âm cuộc gọi
function startRecording() {
    if (currentSession && currentSession.connection) {
        const stream = new MediaStream();
        const receivers = currentSession.connection.getReceivers();

        if (!receivers || receivers.length === 0) {
            console.error('No receivers found for recording');
            return;
        }

        receivers.forEach((receiver) => {
            if (receiver.track && receiver.track.kind === 'audio') {
                stream.addTrack(receiver.track);
            }
        });

        if (stream.getTracks().length === 0) {
            console.error('No audio track found for recording');
            return;
        }

        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (e) => recordedChunks.push(e.data);
        mediaRecorder.start();
        console.log('Recording started');
    } else {
        console.error('No active session or connection for recording');
    }
}

function stopRecording() {
    if (mediaRecorder) {
        mediaRecorder.stop();
        mediaRecorder.onstop = () => {
            if (recordedChunks.length === 0) {
                console.error('No recorded data available');
                return;
            }

            const blob = new Blob(recordedChunks, { type: 'audio/webm' });
            const url = URL.createObjectURL(blob);

            // Lưu lịch sử cuộc gọi
            const caller = document.getElementById('incomingNumber').textContent || 'Unknown';
            const timestamp = new Date().toLocaleString();
            if (!contacts[caller]) contacts[caller] = [];
            contacts[caller].push({ timestamp, url });

            // Hiển thị file ghi âm trong Call History
            const li = document.createElement('li');
            li.textContent = `Call at ${timestamp}`;
            const audio = document.createElement('audio');
            audio.src = url;
            audio.controls = true;
            li.appendChild(audio);
            historyList.appendChild(li);

            console.log('Recording saved:', url);
            recordedChunks = [];
        };
    }
}

// Kết thúc cuộc gọi
function hangupCall() {
    if (currentSession) {
        stopRecording(); // Dừng ghi âm khi kết thúc cuộc gọi
        currentSession.terminate();
        currentSession = null;
        console.log('Call terminated');
    }
}

function addCallToHistory(number, type) {
    const li = document.createElement('li');
    li.textContent = `${type} call: ${number}`;
    historyList.appendChild(li);
}

// Hiển thị lịch sử cuộc gọi
function showCallHistory(caller) {
    historyList.innerHTML = ''; // Xóa danh sách cũ
    contacts[caller].forEach((call) => {
        const li = document.createElement('li');
        li.textContent = `Call at ${call.timestamp}`;
        const audio = document.createElement('audio');
        audio.src = call.url;
        audio.controls = true;
        li.appendChild(audio);
        historyList.appendChild(li);
    });
}

function addNumber(num) {
    const input = document.getElementById('sipTarget');
    input.value += num;
}

ua.start();
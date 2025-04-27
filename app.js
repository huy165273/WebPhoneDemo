const socket = new JsSIP.WebSocketInterface('wss://192.168.100.30:8443/ws');
const configuration = {
    sockets: [socket],
    uri: 'sip:6502@192.168.100.30',
    password: '123456',
    session_timers: false,
    stun_servers: ['stun:stun.l.google.com:19302']
};

const ua = new JsSIP.UA(configuration);
let currentSession = null;
let mediaRecorder = null;
let recordedChunks = [];
const contacts = {}; // Lưu thông tin liên hệ và lịch sử cuộc gọi
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

        // Thêm vào danh sách liên hệ nếu chưa có
        if (!contacts[caller]) {
            contacts[caller] = [];
            const li = document.createElement('li');
            li.textContent = caller;
            li.onclick = () => showCallHistory(caller); // Hiển thị lịch sử cuộc gọi khi nhấn vào số
            contactList.appendChild(li);
        }

        currentSession.on('ended', () => {
            document.getElementById('incomingCall').style.display = 'none';
            console.log('Call ended');
            stopRecording(); // Dừng ghi âm khi kết thúc cuộc gọi
            currentSession = null;
        });

        currentSession.on('failed', () => {
            document.getElementById('incomingCall').style.display = 'none';
            console.log('Call failed');
            stopRecording(); // Dừng ghi âm nếu cuộc gọi thất bại
            currentSession = null;
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

    currentSession.connection.addEventListener('track', (e) => {
        const audio = document.createElement('audio');
        audio.srcObject = e.streams[0];
        audio.autoplay = true;
        document.body.appendChild(audio);
    });

    startRecording(); // Tự động bắt đầu ghi âm khi bắt đầu cuộc gọi
}

// Chấp nhận cuộc gọi
function acceptCall() {
    if (currentSession) {
        currentSession.answer({ mediaConstraints: { audio: true } });

        currentSession.connection.addEventListener('track', (e) => {
            const audio = document.createElement('audio');
            audio.srcObject = e.streams[0];
            audio.autoplay = true;
            document.body.appendChild(audio);
        });

        document.getElementById('incomingCall').style.display = 'none';
        addCallToHistory(document.getElementById('incomingNumber').textContent, 'Incoming');
        console.log('Call accepted');

        startRecording(); // Tự động bắt đầu ghi âm khi chấp nhận cuộc gọi
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
    if (currentSession) {
        const stream = new MediaStream();
        currentSession.connection.getReceivers().forEach((receiver) => {
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

        // Kích hoạt nút Stop Recording, vô hiệu hóa nút Start Recording
        document.getElementById('startRecording').disabled = true;
        document.getElementById('stopRecording').disabled = false;
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

            // Kích hoạt nút Start Recording, vô hiệu hóa nút Stop Recording
            document.getElementById('startRecording').disabled = false;
            document.getElementById('stopRecording').disabled = true;
        };
    }
}

function hangupCall() {
    if (currentSession) {
        currentSession.terminate();
        currentSession = null;
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
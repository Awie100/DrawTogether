const statusMsg = document.getElementById("status");
const inputBox = document.getElementById("inputBox");
const fillButton = document.getElementById("fillButton");

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext('2d');

ctx.lineWidth = 10;
ctx.lineCap = "round";
ctx.fillStyle = 'white';
ctx.fillRect(0, 0, canvas.width, canvas.height);

const colorList = ['#000000', '#ff0000', '#ff6600', '#ffff00', '#00ff00', '#0000ff', '#cc00ff', '#ffffff'];
const buttonListContainer = document.getElementsByClassName("color-button-list")[0];
const buttonList = [];

var lastPeerId = null;
var peer = null;
var peerId = null;
var conn = [];
var admin = null;
var backup = null;
var lastMousePos = null;
var mousepressed = false;
var mouseoncanvas = true;
var drawColor = '#000000';
var filling = false;
var brushSize = 10;
var brush = null;

ctx.fillStyle = 'white';
ctx.fillRect(0, 0, canvas.width, canvas.height);
populateButtons();

function populateButtons() {
    colorList.forEach(col => {
        const button = document.createElement("button");
        button.classList.add("color-button");
        button.style.backgroundColor = col;
        button.addEventListener("click", () => {
            changeColor(col);
            setActiveColor(col);
        });

        buttonList.push(button);
        buttonListContainer.appendChild(button);
    });

    buttonList[0].click();
}

function initPlayer() {
    // Create own peer object with connection to shared PeerJS server
    peer = new Peer("awie100-" + inputBox.value, {
        debug: 2
    });

    peer.on('open', function(id) {
        // Workaround for peer.reconnect deleting previous id
        if (peer.id === null) {
            peer.id = lastPeerId;
        } else {
            lastPeerId = peer.id;
        }
        statusMsg.innerHTML = "ID: " + peer.id;
    });

    peer.on('connection', function(c) {
        if (admin && admin === peer.id) {

            c.on('open', function() {
                if (backup === null) {
                    backup = c.peer;
                }

                const data = {
                    name: "init",
                    width: canvas.width,
                    imgData: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
                    admin: admin,
                    backup: backup
                }

                conn.push(c);
                signal(data);
            });

            c.on('data', function(data) {
                signal(data);
                handleData(data);
            });

            c.on('close', function() {
                statusMsg.innerHTML = c.peer + " left";
                conn = conn.filter(elem => elem.peer !== c.peer);
                if (c.peer === backup) {
                    if (conn.length > 0) {
                        backup = conn[0].peer;
                    } else {
                        backup = null;
                    }

                    const data = {
                        name: "backup_set",
                        backup: backup
                    }
                    signal(data);
                }
            });

        } else {
            c.on('open', function() {
                var data;

                if (admin) {
                    data = {
                        name: "admin_set",
                        admin: admin,
                        backup: backup
                    }
                } else {
                    data = {
                        name: "no_admin",
                    }
                }

                c.send(data);
            });
        }
    });

    peer.on('disconnected', function() {
        peer.id = lastPeerId;
        peer._lastServerId = lastPeerId;
        peer.reconnect();
    });

    peer.on('close', function() {
        conn = [];
    });

    addEventListener('beforeunload', (evt) => {
        conn.forEach(elem => {
            elem.close();
        });
    })

    peer.on('error', function(err) {
        if (err.type === 'invalid-id') {
            statusMsg.innerHTML = "Error: Invalid ID";
        } else if (err.type === 'unavailable-id') {
            statusMsg.innerHTML = "Error: ID Already in Use";
        } else if (!err.type) {
            throw err;
        } else {
            // Basically 500 for all other error types.
            var errorMessage = 'Oops. Something went wrong internally! :(: ' + err;
            this._showNotification(errorMessage, 'error');
            throw new Error(errorMessage);
        }
    });
};

function joinRoom() {
    join("awie100-" + inputBox.value);
}

function join(id) {

    conn.forEach(elem => {
        elem.close();
    });

    var c = peer.connect(id);

    c.on('open', function() {
        statusMsg.innerHTML = "Connected to: " + c.peer;
    });

    c.on('data', function(data) {
        handleData(data);
    });

    c.on('close', function() {
        statusMsg.innerHTML = "Connection closed";
        conn = [];
        if (c.peer === admin) {
            admin = backup;
            backup = null;

            if (peer.id !== admin) {
                join(admin);
            }
        }
    });

    conn = [c];
}

function signal(sigName) {
    conn.forEach(con => {
        if (con && con.open) {
            con.send(sigName);
        } else {
            console.log('Connection is closed');
        }
    });
}

function createRoom() {
    admin = peer.id;
}

function handleData(data) {
    switch (data.name) {
        case 'draw':
            const blob = new Blob([new Uint8Array(data.img)], { type: "image/png" });
            draw(data.lastPos, data.pos, blob);
            break;
        case "fill":
            drawFill(data.pos, data.color);
            break;
        case 'init':
            ctx.putImageData(new ImageData(new Uint8ClampedArray(data.imgData), data.width), 0, 0);
            admin = data.admin;
            backup = data.backup;
            break;
        case 'admin_set':
            admin = data.admin;
            backup = data.backup;
            join(admin);
            break;
        case "backup_set":
            backup = data.backup;
            break;
        case 'no_admin':
            statusMsg.innerHTML = "Not in Room";
            break;
        default:
            statusMsg.innerHTML = "Invalid";
            break;
    }
}

canvas.addEventListener('mousemove', (evt) => {

    if (mousepressed && mouseoncanvas && !filling) {
        const mousePos = getMousePosCanvas(evt)
        draw(lastMousePos, mousePos, brush);

        const data = {
            name: "draw",
            lastPos: lastMousePos,
            pos: mousePos,
            img: brush
        }

        signal(data);
        lastMousePos = mousePos;
    }
});

canvas.addEventListener('mousedown', (evt) => {
    mousepressed = true;
    if (filling && mouseoncanvas) {
        const mousePos = getMousePosCanvas(evt);
        const intPos = {
            x: parseInt(mousePos.x),
            y: parseInt(mousePos.y)
        }

        drawFill(intPos, drawColor);

        const data = {
            name: "fill",
            pos: intPos,
            color: drawColor
        }

        signal(data);
    }
});

canvas.addEventListener('mouseup', (evt) => {
    mousepressed = false;
    lastMousePos = null;
});

canvas.addEventListener('mouseenter', (evt) => {
    mouseoncanvas = true;
});

canvas.addEventListener('mouseleave', (evt) => {
    mouseoncanvas = false;
    mousepressed = false;
    lastMousePos = null;
});

async function draw(lastPos, pos, blob) {
    if (lastPos === null) {
        return;
    }

    createImageBitmap(blob).then((img) => {
        const dy = (pos.y - lastPos.y);
        const dx = (pos.x - lastPos.x);

        const dist = Math.sqrt(dx * dx + dy * dy); // length of line
        for (let i = 0; i < dist; i++) {
            ctx.drawImage(img,
                Math.round(lerp(lastPos.x, pos.x, i / dist) - img.width / 2),
                Math.round(lerp(lastPos.y, pos.y, i / dist) - img.height / 2)
            );
        }
    });
}

function makeBrush(r, col) {
    var offscreen = new OffscreenCanvas(2 * r, 2 * r);
    var offctx = offscreen.getContext('2d');
    var imgData = new ImageData(2 * r, 2 * r);
    var data = imgData.data;

    const r1 = parseInt(col.substr(1, 2), 16);
    const g1 = parseInt(col.substr(3, 2), 16);
    const b1 = parseInt(col.substr(5, 2), 16);


    for (let i = 0; i < data.length; i += 4) {
        const y = (i / 4) / (2 * r) - r;
        const x = (i / 4) % (2 * r) - r;
        if (x * x + y * y <= r * r) {
            data[i] = r1;
            data[i + 1] = g1;
            data[i + 2] = b1;
            data[i + 3] = 255;
        }
    }

    offctx.putImageData(imgData, 0, 0);

    offscreen.convertToBlob().then(blob => {
        brush = blob;
    });
}

function lerp(a, b, n) {
    return a * (1 - n) + b * n;
}

function getMousePosCanvas(evt) {
    var rect = canvas.getBoundingClientRect();
    return {
        x: (evt.clientX - rect.left) / rect.width * canvas.width,
        y: (evt.clientY - rect.top) / rect.height * canvas.height
    }
}

function changeColor(color) {
    drawColor = color;
    makeBrush(brushSize, drawColor);
}

function setActiveColor(color) {
    buttonList.forEach(button => {
        const [r, g, b] = hexToRgb(color);
        button.classList.toggle("active", button.style.backgroundColor === `rgb(${r}, ${g}, ${b})`);
    })
}

function hexToRgb(hexstr) {
    const r = parseInt(hexstr.substr(1, 2), 16);
    const g = parseInt(hexstr.substr(3, 2), 16);
    const b = parseInt(hexstr.substr(5, 2), 16);
    return [r, g, b];
}

function drawFill(pos, color) {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var data = imgData.data;

    const width = canvas.width;
    const height = canvas.height;
    const posPix = (pos.x + width * pos.y) * 4;
    var pixPos = [posPix];
    const [r1, g1, b1] = hexToRgb(color);

    const r2 = data[posPix];
    const g2 = data[posPix + 1];
    const b2 = data[posPix + 2];

    if (colorCompare(r1, g1, b1, r2, g2, b2)) {
        return;
    }

    while (pixPos.length > 0) {
        var posNext = [];
        pixPos.forEach(posPix => {
            data[posPix] = r1;
            data[posPix + 1] = g1;
            data[posPix + 2] = b1;

            const upPos = posPix - width * 4;
            const downPos = posPix + width * 4;
            const leftPos = posPix - 4;
            const rightPos = posPix + 4;

            if ((posPix / 4 > width) && colorCompare(data[upPos], data[upPos + 1], data[upPos + 2], r2, g2, b2)) {
                posNext.push(upPos);
            }

            if ((posPix / 4 < (width - 1) * height) && colorCompare(data[downPos], data[downPos + 1], data[downPos + 2], r2, g2, b2)) {
                posNext.push(downPos);
            }

            if ((posPix / 4 % width > 0) && colorCompare(data[leftPos], data[leftPos + 1], data[leftPos + 2], r2, g2, b2)) {
                posNext.push(leftPos);
            }

            if ((posPix / 4 % width < (width - 1)) && colorCompare(data[rightPos], data[rightPos + 1], data[rightPos + 2], r2, g2, b2)) {
                posNext.push(rightPos);
            }
        });

        pixPos = [...new Set(posNext)];
    }

    ctx.putImageData(imgData, 0, 0);
}

function fillToggle() {
    filling = !filling;
    fillButton.innerHTML = "Fill (" + (filling ? "on" : "off") + ")";
}

function colorCompare(r1, g1, b1, r2, g2, b2) {
    const tolerance = 10;
    return (Math.abs(r1 - r2) < tolerance) && (Math.abs(g1 - g2) < tolerance) && (Math.abs(b1 - b2) < tolerance);
}
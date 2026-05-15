/* canvas.js — Animated molecular background */
(function () {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let W, H, nodes, frame;

    const TEAL = 'rgba(14,116,144,';
    const GOLD = 'rgba(180,83,9,';
    const WHITE = 'rgba(100,116,139,';

    function resize() {
        W = canvas.width = window.innerWidth;
        H = canvas.height = window.innerHeight;
    }

    function randRange(a, b) { return a + Math.random() * (b - a); }

    function createNodes(n) {
        return Array.from({ length: n }, () => ({
            x: Math.random() * W,
            y: Math.random() * H,
            r: randRange(1, 3.5),
            vx: randRange(-0.15, 0.15),
            vy: randRange(-0.15, 0.15),
            color: Math.random() < 0.6 ? TEAL : (Math.random() < 0.5 ? GOLD : WHITE),
            alpha: randRange(0.1, 0.28),
            arms: Math.random() < 0.2 ? Math.floor(randRange(2, 4)) : 0,
        }));
    }

    function drawHexGrid() {
        const size = 80;
        const cols = Math.ceil(W / size) + 2;
        const rows = Math.ceil(H / (size * 0.866)) + 2;
        ctx.strokeStyle = 'rgba(14,116,144,0.06)';
        ctx.lineWidth = 0.6;
        for (let r = -1; r < rows; r++) {
            for (let c = -1; c < cols; c++) {
                const x = c * size + (r % 2 === 0 ? 0 : size / 2);
                const y = r * size * 0.866;
                drawHex(x, y, size * 0.5);
            }
        }
    }

    function drawHex(cx, cy, s) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i - Math.PI / 6;
            const px = cx + s * Math.cos(angle);
            const py = cy + s * Math.sin(angle);
            i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
    }

    function drawConnections(nodes) {
        const maxDist = 140;
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const dx = nodes[i].x - nodes[j].x;
                const dy = nodes[i].y - nodes[j].y;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < maxDist) {
                    const a = (1 - d / maxDist) * 0.08;
                    ctx.beginPath();
                    ctx.strokeStyle = `rgba(14,116,144,${a})`;
                    ctx.lineWidth = 0.7;
                    ctx.moveTo(nodes[i].x, nodes[i].y);
                    ctx.lineTo(nodes[j].x, nodes[j].y);
                    ctx.stroke();
                }
            }
        }
    }

    function tick() {
        ctx.clearRect(0, 0, W, H);

        drawHexGrid();
        drawConnections(nodes);

        nodes.forEach(n => {
            // Draw arms (molecule branches)
            if (n.arms > 0) {
                for (let a = 0; a < n.arms; a++) {
                    const angle = (Math.PI * 2 / n.arms) * a;
                    const len = n.r * 6;
                    ctx.beginPath();
                    ctx.strokeStyle = n.color + (n.alpha * 0.4) + ')';
                    ctx.lineWidth = 0.8;
                    ctx.moveTo(n.x, n.y);
                    ctx.lineTo(n.x + Math.cos(angle) * len, n.y + Math.sin(angle) * len);
                    ctx.stroke();
                    // small atom at end
                    ctx.beginPath();
                    ctx.arc(n.x + Math.cos(angle) * len, n.y + Math.sin(angle) * len, n.r * 0.55, 0, Math.PI * 2);
                    ctx.fillStyle = n.color + (n.alpha * 0.5) + ')';
                    ctx.fill();
                }
            }

            // Main node
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
            ctx.fillStyle = n.color + n.alpha + ')';
            ctx.fill();

            // Move
            n.x += n.vx;
            n.y += n.vy;
            if (n.x < -20) n.x = W + 20;
            if (n.x > W + 20) n.x = -20;
            if (n.y < -20) n.y = H + 20;
            if (n.y > H + 20) n.y = -20;
        });

        frame = requestAnimationFrame(tick);
    }

    function init() {
        resize();
        nodes = createNodes(55);
        if (frame) cancelAnimationFrame(frame);
        tick();
    }

    window.addEventListener('resize', () => { resize(); nodes = createNodes(55); });
    init();
})();
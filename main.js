(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const BEST_SCORE_KEY = 'flappy_best_score_v1';

  // 运行时尺寸（逻辑像素）
  let viewWidth = 0;
  let viewHeight = 0;
  let devicePixelRatioClamped = 1;

  // 世界与实体参数
  let groundHeight = 100; // 会在 resize 时基于视口重算
  let pipeWidth = 80;
  let minGap = 150;
  let maxGap = 220;
  let pipeSpeed = 180; // 像素/秒
  let pipeSpawnDistance = 260; // 两根管之间的水平距离

  // 小鸟参数
  const bird = {
    x: 0,
    y: 0,
    size: 24,
    velocityY: 0,
  };

  // 物理参数
  let gravity = 2000; // 像素/秒^2
  let flapImpulse = -600; // 一次拍打向上初速度

  // 管道
  /** @type {{ x: number; topHeight: number; gap: number; scored: boolean; }[]} */
  let pipes = [];
  let distanceSinceLastPipe = 0;

  // 状态
  /** @type {'ready'|'running'|'gameover'} */
  let gameState = 'ready';
  let score = 0;
  let bestScore = Number(localStorage.getItem(BEST_SCORE_KEY) || 0);

  // 时间
  let lastTimestamp = 0;

  // 工具函数
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function fitCanvasToScreen() {
    viewWidth = Math.max(320, window.innerWidth);
    viewHeight = Math.max(480, window.innerHeight);

    devicePixelRatioClamped = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.floor(viewWidth * devicePixelRatioClamped);
    canvas.height = Math.floor(viewHeight * devicePixelRatioClamped);
    canvas.style.width = viewWidth + 'px';
    canvas.style.height = viewHeight + 'px';

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(devicePixelRatioClamped, devicePixelRatioClamped);

    // 基于视口自适应参数
    groundHeight = clamp(Math.round(viewHeight * 0.18), 80, 140);
    pipeWidth = clamp(Math.round(viewWidth * 0.13), 52, 90);
    minGap = clamp(Math.round(viewHeight * 0.22), 140, 200);
    maxGap = clamp(Math.round(viewHeight * 0.28), 180, 260);
    pipeSpeed = clamp(Math.round(viewWidth * 0.42), 160, 260);
    pipeSpawnDistance = clamp(Math.round(viewWidth * 0.42), 220, 360);

    const birdSize = clamp(Math.round(viewWidth * 0.05), 18, 30);
    const birdX = Math.round(viewWidth * 0.28);
    if (gameState === 'ready') {
      bird.size = birdSize;
      bird.x = birdX;
      bird.y = Math.round(viewHeight * 0.42);
      bird.velocityY = 0;
    } else {
      // 非初始状态：仅同步尺寸和 x 位置，避免突然跳变
      bird.size = birdSize;
      bird.x = birdX;
    }

    gravity = clamp(Math.round(viewHeight * 4.0), 1600, 2600);
    flapImpulse = clamp(Math.round(-viewHeight * 1.0), -800, -520);
  }

  function resetGame() {
    pipes = [];
    distanceSinceLastPipe = 0;
    score = 0;
    gameState = 'ready';
    fitCanvasToScreen();
  }

  function startGame() {
    if (gameState !== 'ready') return;
    gameState = 'running';
    bird.velocityY = 0;
  }

  function gameOver() {
    if (gameState === 'gameover') return;
    gameState = 'gameover';
    if (score > bestScore) {
      bestScore = score;
      localStorage.setItem(BEST_SCORE_KEY, String(bestScore));
    }
  }

  function flap() {
    if (gameState === 'ready') {
      startGame();
    }
    if (gameState !== 'running') return;
    bird.velocityY = flapImpulse;
  }

  function spawnPipe() {
    const gap = Math.round(minGap + Math.random() * (maxGap - minGap));
    const maxTop = viewHeight - groundHeight - gap - 40;
    const minTop = 40;
    const topHeight = Math.round(minTop + Math.random() * Math.max(0, maxTop - minTop));
    pipes.push({ x: viewWidth + 10, topHeight, gap, scored: false });
  }

  function update(dt) {
    if (gameState !== 'running') return;
    const dtClamped = Math.min(dt, 0.033); // 防止切回 tab 带来过大步长

    // 小鸟物理
    bird.velocityY += gravity * dtClamped;
    bird.y += bird.velocityY * dtClamped;

    // 地面与天花板碰撞
    const birdHalf = bird.size / 2;
    const floorY = viewHeight - groundHeight;
    if (bird.y + birdHalf >= floorY) {
      bird.y = floorY - birdHalf;
      gameOver();
    }
    if (bird.y - birdHalf <= 0) {
      bird.y = birdHalf;
      bird.velocityY = 0;
    }

    // 管道移动与生成
    const distance = pipeSpeed * dtClamped;
    distanceSinceLastPipe += distance;
    if (distanceSinceLastPipe >= pipeSpawnDistance) {
      distanceSinceLastPipe = 0;
      spawnPipe();
    }

    for (let i = 0; i < pipes.length; i += 1) {
      pipes[i].x -= distance;
    }
    // 移除离开屏幕的管道
    while (pipes.length && pipes[0].x + pipeWidth < -60) {
      pipes.shift();
    }

    // 计分与碰撞检测
    const birdRect = {
      x: bird.x - birdHalf,
      y: bird.y - birdHalf,
      w: bird.size,
      h: bird.size,
    };
    for (let i = 0; i < pipes.length; i += 1) {
      const p = pipes[i];
      // 通过管道中心计分
      if (!p.scored && p.x + pipeWidth < bird.x) {
        p.scored = true;
        score += 1;
      }

      // 顶部矩形
      const topRect = { x: p.x, y: 0, w: pipeWidth, h: p.topHeight };
      // 底部矩形
      const bottomRect = {
        x: p.x,
        y: p.topHeight + p.gap,
        w: pipeWidth,
        h: viewHeight - groundHeight - (p.topHeight + p.gap),
      };

      if (rectsOverlap(birdRect, topRect) || rectsOverlap(birdRect, bottomRect)) {
        gameOver();
      }
    }
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function drawBackground() {
    // 天空
    ctx.fillStyle = '#70c5ce';
    ctx.fillRect(0, 0, viewWidth, viewHeight);

    // 远景云（简单装饰）
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    const cloudY = Math.round(viewHeight * 0.18);
    drawCloud(40, cloudY, 28);
    drawCloud(Math.round(viewWidth * 0.5), Math.round(cloudY * 0.8), 24);
    drawCloud(Math.round(viewWidth * 0.8), Math.round(cloudY * 1.1), 32);
  }

  function drawCloud(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.arc(x + r * 0.9, y + r * 0.3, r * 0.8, 0, Math.PI * 2);
    ctx.arc(x - r * 0.8, y + r * 0.2, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawGround() {
    ctx.fillStyle = '#ded895';
    ctx.fillRect(0, viewHeight - groundHeight, viewWidth, groundHeight);
    // 草皮
    ctx.fillStyle = '#83d07b';
    ctx.fillRect(0, viewHeight - groundHeight, viewWidth, 20);
  }

  function drawPipes() {
    for (let i = 0; i < pipes.length; i += 1) {
      const p = pipes[i];
      ctx.fillStyle = '#5ec45e';
      ctx.strokeStyle = '#3a9b3a';
      ctx.lineWidth = 3;

      // 顶部
      ctx.fillRect(p.x, 0, pipeWidth, p.topHeight);
      ctx.strokeRect(p.x, 0, pipeWidth, p.topHeight);
      // 顶部帽檐
      ctx.fillRect(p.x - 3, p.topHeight - 16, pipeWidth + 6, 16);
      ctx.strokeRect(p.x - 3, p.topHeight - 16, pipeWidth + 6, 16);

      // 底部
      const bottomY = p.topHeight + p.gap;
      const bottomH = viewHeight - groundHeight - bottomY;
      ctx.fillRect(p.x, bottomY, pipeWidth, bottomH);
      ctx.strokeRect(p.x, bottomY, pipeWidth, bottomH);
      // 底部帽檐
      ctx.fillRect(p.x - 3, bottomY, pipeWidth + 6, 16);
      ctx.strokeRect(p.x - 3, bottomY, pipeWidth + 6, 16);
    }
  }

  function drawBird() {
    const r = bird.size / 2;
    // 身体
    ctx.fillStyle = '#ffd94a';
    ctx.beginPath();
    ctx.arc(bird.x, bird.y, r, 0, Math.PI * 2);
    ctx.fill();
    // 眼睛
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(bird.x + r * 0.2, bird.y - r * 0.2, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(bird.x + r * 0.35, bird.y - r * 0.2, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
    // 嘴
    ctx.fillStyle = '#ff9e3d';
    ctx.beginPath();
    ctx.moveTo(bird.x + r * 0.2, bird.y + r * 0.05);
    ctx.lineTo(bird.x + r * 0.85, bird.y + r * 0.2);
    ctx.lineTo(bird.x + r * 0.2, bird.y + r * 0.35);
    ctx.closePath();
    ctx.fill();
  }

  function drawScore() {
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 4;
    ctx.font = 'bold ' + Math.round(viewWidth * 0.08) + 'px system-ui, -apple-system, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const text = String(score);
    ctx.strokeText(text, viewWidth / 2, 20);
    ctx.fillText(text, viewWidth / 2, 20);
  }

  function drawReady() {
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 6;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const s = Math.min(viewWidth, viewHeight);
    const titleSize = Math.round(s * 0.08);
    const tipSize = Math.round(s * 0.05);
    const bestSize = Math.round(s * 0.06);

    const baseY = viewHeight * 0.35;

    ctx.font = 'bold ' + titleSize + 'px system-ui, -apple-system, Arial, sans-serif';
    const title = '点击/触控/空格开始';
    ctx.strokeText(title, viewWidth / 2, baseY);
    ctx.fillText(title, viewWidth / 2, baseY);

    const tipY = Math.round(baseY + titleSize * 1.2);
    ctx.font = '600 ' + tipSize + 'px system-ui, -apple-system, Arial, sans-serif';
    const tip = '上升：点击屏幕 / 触控 / 空格';
    ctx.strokeText(tip, viewWidth / 2, tipY);
    ctx.fillText(tip, viewWidth / 2, tipY);

    // 最佳成绩（基于短边字号与自适应间距）
    const bestY = Math.round(tipY + tipSize * 1.4);
    drawBestScore(bestY, bestSize);
  }

  function drawGameOver() {
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 6;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const s = Math.min(viewWidth, viewHeight);
    const titleSize = Math.round(s * 0.1);
    const scoreSize = Math.round(s * 0.06);
    const bestSize = Math.round(s * 0.06);
    const tipSize = Math.round(s * 0.05);

    const baseY = viewHeight * 0.32;

    ctx.font = 'bold ' + titleSize + 'px system-ui, -apple-system, Arial, sans-serif';
    ctx.strokeText('游戏结束', viewWidth / 2, baseY);
    ctx.fillText('游戏结束', viewWidth / 2, baseY);

    const scoreY = Math.round(baseY + titleSize * 1.2);
    ctx.font = '600 ' + scoreSize + 'px system-ui, -apple-system, Arial, sans-serif';
    const sText = `分数 ${score}`;
    ctx.strokeText(sText, viewWidth / 2, scoreY);
    ctx.fillText(sText, viewWidth / 2, scoreY);

    const bestY = Math.round(scoreY + scoreSize * 1.3);
    drawBestScore(bestY, bestSize);

    const tipY = Math.round(bestY + bestSize * 1.3);
    ctx.font = '600 ' + tipSize + 'px system-ui, -apple-system, Arial, sans-serif';
    const tip = '点击/触控/空格 重新开始';
    ctx.strokeText(tip, viewWidth / 2, tipY);
    ctx.fillText(tip, viewWidth / 2, tipY);
  }

  function drawBestScore(y, size) {
    const text = `最佳 ${bestScore}`;
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 4;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const s = Math.min(viewWidth, viewHeight);
    const fontSize = Math.round(size || s * 0.06);
    ctx.font = 'bold ' + fontSize + 'px system-ui, -apple-system, Arial, sans-serif';
    const yy = y !== undefined ? y : Math.round(viewHeight * 0.35 + fontSize * 1.8);
    ctx.strokeText(text, viewWidth / 2, yy);
    ctx.fillText(text, viewWidth / 2, yy);
  }

  function render() {
    drawBackground();
    drawPipes();
    drawGround();
    drawBird();
    if (gameState === 'running') {
      drawScore();
    } else if (gameState === 'ready') {
      drawScore();
      drawReady();
    } else if (gameState === 'gameover') {
      drawScore();
      drawGameOver();
    }
  }

  function loop(ts) {
    if (!lastTimestamp) lastTimestamp = ts;
    const dt = (ts - lastTimestamp) / 1000;
    lastTimestamp = ts;

    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // 输入
  function onPrimaryAction() {
    if (gameState === 'gameover') {
      resetGame();
      return;
    }
    flap();
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      onPrimaryAction();
    }
  });
  // 统一使用 pointer 以兼容鼠标与触控
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    onPrimaryAction();
  });

  window.addEventListener('resize', () => {
    fitCanvasToScreen();
  });

  document.addEventListener('visibilitychange', () => {
    // 可扩展：切出时可暂停；当前使用自然减速（dt 限制）
  });

  // 初始化
  fitCanvasToScreen();
  resetGame();
  requestAnimationFrame(loop);
})();



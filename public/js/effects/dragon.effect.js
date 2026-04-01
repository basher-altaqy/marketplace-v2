/**
 * Advanced Dragon Effect Module
 * Canvas 2D background effect for public marketplace views only.
 * Features: chain-linked segmented body, sci‑fi metallic decorations, wandering motion,
 * periodic fire breath, respects performance and accessibility.
 */

(function() {
  // ----------------------------------------------------------------------
  //  Utility
  // ----------------------------------------------------------------------
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function randomRange(min, max) {
    return min + Math.random() * (max - min);
  }

  // ----------------------------------------------------------------------
  //  Particle System for Fire Breath
  // ----------------------------------------------------------------------
  class Particle {
    constructor(x, y, vx, vy, size, color, life) {
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.size = size;
      this.color = color;
      this.life = life;
      this.maxLife = life;
    }

    update(dt) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vy += 800 * dt; // gravity
      this.life -= dt;
      return this.life > 0;
    }

    draw(ctx) {
      const alpha = Math.min(1, this.life / this.maxLife);
      ctx.globalAlpha = alpha * 0.8;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  class ParticleSystem {
    constructor() {
      this.particles = [];
      this.lastEmitTime = 0;
      this.emitInterval = 5; // seconds
    }

    update(dt, now, headX, headY, headAngle) {
      if (now - this.lastEmitTime >= this.emitInterval) {
        this.emitFire(headX, headY, headAngle);
        this.lastEmitTime = now;
      }

      for (let i = this.particles.length - 1; i >= 0; i--) {
        if (!this.particles[i].update(dt)) {
          this.particles.splice(i, 1);
        }
      }
    }

    emitFire(x, y, angle) {
      const count = 40 + Math.floor(Math.random() * 30);
      for (let i = 0; i < count; i++) {
        const speed = randomRange(150, 400);
        const dirAngle = angle + randomRange(-0.8, 0.8);
        const vx = Math.cos(dirAngle) * speed;
        const vy = Math.sin(dirAngle) * speed;
        const size = randomRange(3, 8);
        const color = `hsl(${randomRange(20, 50)}, 100%, 60%)`;
        const life = randomRange(0.4, 1.0);
        this.particles.push(new Particle(x, y, vx, vy, size, color, life));
      }
    }

    draw(ctx) {
      for (const p of this.particles) {
        p.draw(ctx);
      }
    }
  }

  // ----------------------------------------------------------------------
  //  Dragon Segment (chain link)
  // ----------------------------------------------------------------------
  class Segment {
    constructor(x, y, length, index) {
      this.x = x;
      this.y = y;
      this.vx = 0;
      this.vy = 0;
      this.length = length;
      this.index = index;
      this.angle = 0;
    }

    applySpring(targetX, targetY, stiffness, dt) {
      const dx = targetX - this.x;
      const dy = targetY - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.001) return;
      const force = (dist - this.length) * stiffness;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      this.vx += fx * dt;
      this.vy += fy * dt;
    }

    update(dt, damping) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vx *= damping;
      this.vy *= damping;
    }

    draw(ctx, scale, prevX, prevY) {
      if (prevX !== undefined && prevY !== undefined) {
        this.angle = Math.atan2(this.y - prevY, this.x - prevX);
      }
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      ctx.scale(scale, scale);

      // Body shape (elongated)
      ctx.beginPath();
      ctx.ellipse(0, 0, this.length * 0.8, this.length * 0.5, 0, 0, Math.PI * 2);
      const hue = (this.index * 15 + 180) % 360;
      const grad = ctx.createLinearGradient(-this.length * 0.5, -this.length * 0.3, this.length * 0.5, this.length * 0.3);
      grad.addColorStop(0, `hsl(${hue}, 70%, 45%)`);
      grad.addColorStop(0.5, `hsl(${hue}, 80%, 65%)`);
      grad.addColorStop(1, `hsl(${hue}, 70%, 35%)`);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = `hsl(${hue}, 90%, 80%)`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Decorative runes
      ctx.beginPath();
      for (let i = -this.length * 0.6; i <= this.length * 0.6; i += this.length * 0.3) {
        ctx.moveTo(i, -this.length * 0.2);
        ctx.lineTo(i + this.length * 0.15, this.length * 0.1);
        ctx.lineTo(i, this.length * 0.2);
        ctx.lineTo(i - this.length * 0.15, this.length * 0.1);
        ctx.fillStyle = `hsl(${hue + 30}, 90%, 70%)`;
        ctx.fill();
      }
      ctx.restore();

      // Subtle glow
      ctx.save();
      ctx.shadowBlur = 6;
      ctx.shadowColor = `hsl(${hue}, 80%, 60%)`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.length * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, 80%, 60%, 0.1)`;
      ctx.fill();
      ctx.restore();
    }
  }

  // ----------------------------------------------------------------------
  //  Main Dragon Class
  // ----------------------------------------------------------------------
  class AdvancedDragonEffect {
    constructor(options = {}) {
      this.options = {
        targetSelector: options.targetSelector || '.app-shell',
        enabledOn: Array.isArray(options.enabledOn) ? options.enabledOn : ['home', 'catalog', 'seller'],
        opacity: options.opacity ?? 0.22,
        speed: options.speed ?? 0.4,
        scale: options.scale ?? 0.7,
        intensity: options.intensity || 'low',
        segmentCount: options.segmentCount ?? 12,
        segmentLength: options.segmentLength ?? 28,
        stiffness: options.stiffness ?? 120,
        damping: options.damping ?? 0.96,
        wanderStrength: options.wanderStrength ?? 1.2,
        maxSpeed: options.maxSpeed ?? 180,
      };

      this.container = null;
      this.canvas = null;
      this.ctx = null;

      this.width = 0;
      this.height = 0;

      this.segments = [];
      this.particleSystem = new ParticleSystem();

      this.headVx = 0;
      this.headVy = 0;
      this.wanderAngle = 0;

      this.animationId = null;
      this.lastTimestamp = 0;
      this.isRunning = false;
      this.isVisible = true;
      this.isEnabledForCurrentView = true;

      this.isReducedMotion = false;
      this.isSmallScreen = false;
      this.frameSkip = 1;
      this.frameCount = 0;

      this.lastFireTime = 0;
    }

    init() {
      try {
        if (activeInstance) return false;

        const targetEl = document.querySelector(this.options.targetSelector);
        if (!targetEl) return false;

        if (window.location.pathname.includes('/admin')) return false;

        this._createCanvasLayer();
        this._syncCanvasSize();
        this._initSegments();
        this._updateViewState();
        this._addEventListeners();

        this.isRunning = true;
        this.animationId = requestAnimationFrame(this._animate.bind(this));
        activeInstance = this;
        return true;
      } catch (error) {
        console.error('[AdvancedDragonEffect] init error:', error);
        this.destroy();
        return false;
      }
    }

    destroy() {
      this.isRunning = false;
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
      }
      this._removeEventListeners();
      if (this.container && this.container.parentNode) {
        this.container.parentNode.removeChild(this.container);
      }
      this.container = null;
      this.canvas = null;
      this.ctx = null;
      this.lastTimestamp = 0;
      if (activeInstance === this) activeInstance = null;
    }

    _createCanvasLayer() {
      const layer = document.createElement('div');
      layer.id = 'dragon-effect-layer';
      layer.setAttribute('aria-hidden', 'true');
      layer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 0;
        overflow: hidden;
      `;

      const canvas = document.createElement('canvas');
      canvas.className = 'dragon-effect-canvas';
      canvas.style.cssText = `
        display: block;
        width: 100%;
        height: 100%;
        opacity: ${this.options.opacity};
      `;
      layer.appendChild(canvas);
      document.body.appendChild(layer);

      this.container = layer;
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: true });
    }

    _syncCanvasSize() {
      if (!this.canvas) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.75);
      this.width = window.innerWidth;
      this.height = window.innerHeight;

      this.canvas.width = Math.floor(this.width * ratio);
      this.canvas.height = Math.floor(this.height * ratio);
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
      this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    _initSegments() {
      const startX = this.width * 0.5;
      const startY = this.height * 0.6;
      const segLen = this.options.segmentLength;
      this.segments = [];
      for (let i = 0; i < this.options.segmentCount; i++) {
        const x = startX - i * segLen;
        const y = startY;
        this.segments.push(new Segment(x, y, segLen, i));
      }
      // Head is segment 0
      this.headVx = 0.2;
      this.headVy = -0.1;
      this.wanderAngle = Math.random() * Math.PI * 2;
    }

    _getCurrentViewKey() {
      const activeView = document.querySelector('.view:not(.hidden)');
      if (!activeView) return 'home';
      const idMap = {
        homeView: 'home',
        catalogView: 'catalog',
        sellerView: 'seller',
        authView: 'auth',
        profileView: 'profile',
        dashboardView: 'dashboard',
        messagesView: 'messages',
        adminView: 'admin'
      };
      return idMap[activeView.id] || 'home';
    }

    _updateViewState() {
      const currentView = this._getCurrentViewKey();
      this.isEnabledForCurrentView = this.options.enabledOn.includes(currentView);
      if (this.container) {
        this.container.style.opacity = this.isEnabledForCurrentView ? '1' : '0';
      }
      if (!this.isEnabledForCurrentView && this.ctx) {
        this.ctx.clearRect(0, 0, this.width, this.height);
      }
    }

    _addEventListeners() {
      this._resizeHandler = () => {
        this._syncCanvasSize();
        this._clampAllSegments();
      };
      this._visibilityHandler = () => {
        this.isVisible = !document.hidden;
      };
      this._viewHandler = () => {
        this._updateViewState();
      };

      window.addEventListener('resize', this._resizeHandler, { passive: true });
      document.addEventListener('visibilitychange', this._visibilityHandler);
      window.addEventListener('marketplace:viewchange', this._viewHandler);
    }

    _removeEventListeners() {
      window.removeEventListener('resize', this._resizeHandler);
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      window.removeEventListener('marketplace:viewchange', this._viewHandler);
    }

    _clampAllSegments() {
      const margin = 80;
      for (const seg of this.segments) {
        seg.x = clamp(seg.x, margin, this.width - margin);
        seg.y = clamp(seg.y, margin, this.height - margin);
      }
    }

    _updateHeadMotion(dt) {
      const speedFactor = this.options.speed;
      const maxSpeed = this.options.maxSpeed * speedFactor;
      const steerStrength = 2.5;

      // Wander angle evolves randomly
      this.wanderAngle += (Math.random() - 0.5) * 0.8 * dt;
      const targetVx = Math.cos(this.wanderAngle) * maxSpeed;
      const targetVy = Math.sin(this.wanderAngle) * maxSpeed;

      // Steering towards wander target
      this.headVx += (targetVx - this.headVx) * steerStrength * dt;
      this.headVy += (targetVy - this.headVy) * steerStrength * dt;

      // Limit speed
      const spd = Math.hypot(this.headVx, this.headVy);
      if (spd > maxSpeed) {
        this.headVx = (this.headVx / spd) * maxSpeed;
        this.headVy = (this.headVy / spd) * maxSpeed;
      }

      // Update head position (segment 0)
      const head = this.segments[0];
      head.x += this.headVx * dt;
      head.y += this.headVy * dt;

      // Boundaries with soft bounce
      const margin = 100;
      const bounce = 0.5;
      if (head.x < margin) {
        head.x = margin;
        this.headVx = Math.abs(this.headVx) * bounce;
      }
      if (head.x > this.width - margin) {
        head.x = this.width - margin;
        this.headVx = -Math.abs(this.headVx) * bounce;
      }
      if (head.y < margin) {
        head.y = margin;
        this.headVy = Math.abs(this.headVy) * bounce;
      }
      if (head.y > this.height - margin) {
        head.y = this.height - margin;
        this.headVy = -Math.abs(this.headVy) * bounce;
      }
    }

    _updateChain(dt) {
      const stiffness = this.options.stiffness;
      const damping = this.options.damping;
      const segments = this.segments;

      // Apply spring forces between consecutive segments
      for (let i = 1; i < segments.length; i++) {
        segments[i].applySpring(segments[i-1].x, segments[i-1].y, stiffness, dt);
      }

      // Update positions
      for (let i = 1; i < segments.length; i++) {
        segments[i].update(dt, damping);
      }

      // Additional constraint iterations for stability
      for (let iter = 0; iter < 2; iter++) {
        for (let i = 1; i < segments.length; i++) {
          const prev = segments[i-1];
          const curr = segments[i];
          const dx = curr.x - prev.x;
          const dy = curr.y - prev.y;
          const dist = Math.hypot(dx, dy);
          if (dist === 0) continue;
          const overlap = (dist - curr.length) * 0.5;
          const correctionX = (dx / dist) * overlap;
          const correctionY = (dy / dist) * overlap;
          if (i === 1) {
            curr.x -= correctionX;
            curr.y -= correctionY;
          } else {
            curr.x -= correctionX;
            curr.y -= correctionY;
            prev.x += correctionX;
            prev.y += correctionY;
          }
        }
      }
    }

    _drawHead(ctx, head, scale) {
      ctx.save();
      ctx.translate(head.x, head.y);
      ctx.rotate(head.angle);
      ctx.scale(scale, scale);

      // Head shape
      ctx.beginPath();
      ctx.moveTo(25, 0);
      ctx.quadraticCurveTo(15, -12, 0, -10);
      ctx.quadraticCurveTo(-15, -8, -22, 0);
      ctx.quadraticCurveTo(-15, 8, 0, 10);
      ctx.quadraticCurveTo(15, 12, 25, 0);
      const grad = ctx.createLinearGradient(-15, -5, 15, 5);
      grad.addColorStop(0, '#7a8c9e');
      grad.addColorStop(1, '#3a4c5e');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = '#b0e0ff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Eye with glow
      ctx.beginPath();
      ctx.arc(18, -3, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffaa44';
      ctx.fill();
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#ffaa44';
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(18, -3, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // Horns
      ctx.beginPath();
      ctx.moveTo(5, -12);
      ctx.lineTo(12, -22);
      ctx.lineTo(-2, -16);
      ctx.fillStyle = '#8a9bb0';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(-5, -12);
      ctx.lineTo(-12, -22);
      ctx.lineTo(2, -16);
      ctx.fill();

      ctx.restore();
    }

    _draw() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.width, this.height);

      // Draw body segments (tail to head)
      for (let i = this.segments.length - 1; i >= 0; i--) {
        const seg = this.segments[i];
        const prev = i > 0 ? this.segments[i-1] : null;
        seg.draw(ctx, this.options.scale, prev ? prev.x : undefined, prev ? prev.y : undefined);
      }

      // Draw head separately
      const head = this.segments[0];
      this._drawHead(ctx, head, this.options.scale);

      // Fire particles
      this.particleSystem.draw(ctx);
    }

    _animate(timestamp = 0) {
      if (!this.isRunning) return;

      if (!this.lastTimestamp) {
        this.lastTimestamp = timestamp;
        this.animationId = requestAnimationFrame(this._animate.bind(this));
        return;
      }

      let dt = Math.min(0.033, (timestamp - this.lastTimestamp) / 1000);
      if (dt <= 0) {
        this.lastTimestamp = timestamp;
        this.animationId = requestAnimationFrame(this._animate.bind(this));
        return;
      }
      this.lastTimestamp = timestamp;

      // Performance frame skipping
      if (this.frameSkip > 1) {
        this.frameCount++;
        if (this.frameCount % this.frameSkip !== 0) {
          this.animationId = requestAnimationFrame(this._animate.bind(this));
          return;
        }
      }

      if (this.isVisible && this.isEnabledForCurrentView && this.ctx) {
        this._updateHeadMotion(dt);
        this._updateChain(dt);
        this.particleSystem.update(dt, timestamp / 1000, this.segments[0].x, this.segments[0].y, this.segments[0].angle);
        this._draw();
      }

      this.animationId = requestAnimationFrame(this._animate.bind(this));
    }
  }

  // ----------------------------------------------------------------------
  //  Module Exports (global and ES module)
  // ----------------------------------------------------------------------
  let activeInstance = null;

  window.initDragonEffect = async function(options = {}) {
    if (activeInstance) {
      window.destroyDragonEffect();
    }
    const effect = new AdvancedDragonEffect(options);
    const ok = effect.init();
    if (ok) {
      activeInstance = effect;
      window.__dragonEffectInstance = effect;
    }
    return ok;
  };

  window.destroyDragonEffect = function() {
    if (window.__dragonEffectInstance) {
      window.__dragonEffectInstance.destroy();
      window.__dragonEffectInstance = null;
    }
    activeInstance = null;
  };
})();

// ES module exports (if used in module context)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initDragonEffect: window.initDragonEffect, destroyDragonEffect: window.destroyDragonEffect };
}

const initDragonEffect = window.initDragonEffect;
const destroyDragonEffect = window.destroyDragonEffect;

export { initDragonEffect, destroyDragonEffect };

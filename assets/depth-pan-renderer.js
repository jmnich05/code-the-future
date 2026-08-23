import * as THREE from "./vendor/three/three.module.min.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function imageReady(image) {
  if (image.complete && image.naturalWidth) return Promise.resolve();
  return new Promise((resolve, reject) => {
    image.addEventListener("load", resolve, { once: true });
    image.addEventListener("error", () => reject(new Error("Hero image failed to load")), { once: true });
  });
}

function textureFromImage(image) {
  const texture = new THREE.Texture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Adds a Tiefling-depth-driven Three.js layer to an existing image explorer.
 * Input, focus, expansion, and accessibility remain owned by the page controller.
 */
export async function mountDepthPanRenderer({
  stage,
  image,
  canvas,
  depthUrl,
  strength = 0.024,
  focus = 0.42,
  maxBufferPixels = 1800000,
} = {}) {
  if (!stage || !image || !canvas || !depthUrl) throw new Error("Depth renderer is missing required inputs");

  stage.dataset.depthState = "loading";
  await imageReady(image);

  const context = canvas.getContext("webgl2", {
    alpha: true,
    antialias: true,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    powerPreference: "high-performance",
  });
  if (!context) {
    stage.dataset.depthState = "fallback";
    throw new Error("WebGL2 is unavailable");
  }

  let renderer;
  let colorTexture;
  let depthTexture;
  let geometry;
  let material;
  let mesh;
  let frame = 0;
  let destroyed = false;
  let active = true;
  let visible = true;
  let firstFrame = true;

  const target = { panX: 0, panY: 0, scroll: 0, zoom: 1.34 };
  const current = { ...target };

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const uniforms = {
    uColor: { value: null },
    uDepth: { value: null },
    uPan: { value: new THREE.Vector2() },
    uScroll: { value: 0 },
    uZoom: { value: target.zoom },
    uStrength: { value: clamp(Number(strength) || 0.024, 0.006, 0.05) },
    uFocus: { value: clamp(Number(focus) || 0.42, 0.1, 0.9) },
    uViewportAspect: { value: 1 },
    uImageAspect: { value: image.naturalWidth / image.naturalHeight },
  };

  function removeReadyState(state = "fallback") {
    stage.classList.remove("is-depth-ready");
    stage.dataset.depthState = state;
    canvas.hidden = true;
  }

  function render() {
    frame = 0;
    if (destroyed || !active || !visible || document.hidden) return;

    const ease = 0.16;
    current.panX += (target.panX - current.panX) * ease;
    current.panY += (target.panY - current.panY) * ease;
    current.scroll += (target.scroll - current.scroll) * ease;
    current.zoom += (target.zoom - current.zoom) * ease;

    uniforms.uPan.value.set(current.panX, current.panY);
    uniforms.uScroll.value = current.scroll;
    uniforms.uZoom.value = current.zoom;
    renderer.render(scene, camera);

    if (firstFrame) {
      firstFrame = false;
      canvas.hidden = false;
      stage.dataset.depthState = "ready";
      requestAnimationFrame(() => stage.classList.add("is-depth-ready"));
      stage.dispatchEvent(new CustomEvent("depthrendererready"));
    }

    const moving =
      Math.abs(target.panX - current.panX) > 0.0005 ||
      Math.abs(target.panY - current.panY) > 0.0005 ||
      Math.abs(target.scroll - current.scroll) > 0.0005 ||
      Math.abs(target.zoom - current.zoom) > 0.0005;
    if (moving) frame = requestAnimationFrame(render);
  }

  function scheduleRender() {
    if (!frame && !destroyed && active && visible && !document.hidden) frame = requestAnimationFrame(render);
  }

  function resize() {
    if (destroyed) return;
    const box = stage.getBoundingClientRect();
    const width = Math.max(1, Math.round(box.width));
    const height = Math.max(1, Math.round(box.height));
    const dprLimit = Math.sqrt(maxBufferPixels / Math.max(1, width * height));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5, dprLimit));
    renderer.setSize(width, height, false);
    uniforms.uViewportAspect.value = width / height;
    scheduleRender();
  }

  function setView({ panX, panY, drift = 0, expanded = false } = {}) {
    if (destroyed) return;
    if (Number.isFinite(panX)) target.panX = clamp(panX, -1, 1);
    if (Number.isFinite(panY)) target.panY = clamp(panY, -1, 1);
    if (Number.isFinite(drift)) target.scroll = clamp(drift / 14, -1, 1);
    target.zoom = expanded ? 1.48 : 1.34;
    scheduleRender();
  }

  function setActive(nextActive) {
    if (destroyed || active === Boolean(nextActive)) return;
    active = Boolean(nextActive);
    if (!active) {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      removeReadyState("paused");
      return;
    }

    if (!firstFrame) {
      canvas.hidden = false;
      stage.dataset.depthState = "ready";
      requestAnimationFrame(() => {
        if (!destroyed && active) stage.classList.add("is-depth-ready");
      });
    }
    scheduleRender();
  }

  function handleContextLost(event) {
    if (destroyed) return;
    destroyed = true;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    observer?.disconnect();
    document.removeEventListener("visibilitychange", handleVisibility);
    canvas.removeEventListener("webglcontextlost", handleContextLost);
    removeReadyState("context-lost");
    stage.dispatchEvent(new CustomEvent("depthrendererfallback", { detail: { reason: "context-lost" } }));
  }

  function handleVisibility() {
    if (!document.hidden) scheduleRender();
  }

  const observer = "IntersectionObserver" in window
    ? new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible) scheduleRender();
      }, { rootMargin: "280px" })
    : null;

  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      context,
      alpha: true,
      antialias: true,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);

    colorTexture = textureFromImage(image);
    depthTexture = await new THREE.TextureLoader().loadAsync(depthUrl);
    depthTexture.colorSpace = THREE.NoColorSpace;
    depthTexture.minFilter = THREE.LinearFilter;
    depthTexture.magFilter = THREE.LinearFilter;
    depthTexture.wrapS = THREE.ClampToEdgeWrapping;
    depthTexture.wrapT = THREE.ClampToEdgeWrapping;

    uniforms.uColor.value = colorTexture;
    uniforms.uDepth.value = depthTexture;

    geometry = new THREE.PlaneGeometry(2, 2, 1, 1);
    material = new THREE.ShaderMaterial({
      uniforms,
      depthTest: false,
      depthWrite: false,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform sampler2D uColor;
        uniform sampler2D uDepth;
        uniform vec2 uPan;
        uniform float uScroll;
        uniform float uZoom;
        uniform float uStrength;
        uniform float uFocus;
        uniform float uViewportAspect;
        uniform float uImageAspect;
        varying vec2 vUv;

        void main() {
          vec2 visibleScale = vec2(1.0);
          if (uViewportAspect > uImageAspect) {
            visibleScale.y = uImageAspect / uViewportAspect;
          } else {
            visibleScale.x = uViewportAspect / uImageAspect;
          }
          visibleScale /= uZoom;

          vec2 travel = (vec2(1.0) - visibleScale) * 0.43;
          vec2 baseUv = vec2(0.5) + (vUv - vec2(0.5)) * visibleScale + uPan * travel;
          float depth = texture2D(uDepth, clamp(baseUv, 0.002, 0.998)).r;
          float relief = depth - uFocus;

          vec2 edge = smoothstep(vec2(0.0), vec2(0.14), vUv) *
                      (vec2(1.0) - smoothstep(vec2(0.86), vec2(1.0), vUv));
          float edgeHold = edge.x * edge.y;
          vec2 motionVector = vec2(uPan.x, uPan.y + uScroll * 0.82);
          vec2 sampleUv = baseUv + motionVector * relief * uStrength * edgeHold;
          sampleUv = clamp(sampleUv, vec2(0.004), vec2(0.996));

          gl_FragColor = texture2D(uColor, sampleUv);
          #include <colorspace_fragment>
        }
      `,
    });
    mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    canvas.addEventListener("webglcontextlost", handleContextLost, false);
    document.addEventListener("visibilitychange", handleVisibility);
    observer?.observe(stage);
    resize();
    scheduleRender();
  } catch (error) {
    removeReadyState("fallback");
    renderer?.dispose();
    colorTexture?.dispose();
    depthTexture?.dispose();
    geometry?.dispose();
    material?.dispose();
    throw error;
  }

  return {
    setView,
    setActive,
    resize,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      document.removeEventListener("visibilitychange", handleVisibility);
      stage.classList.remove("is-depth-ready");
      stage.dataset.depthState = "destroyed";
      canvas.hidden = true;
      scene.remove(mesh);
      geometry?.dispose();
      material?.dispose();
      colorTexture?.dispose();
      depthTexture?.dispose();
      renderer?.dispose();
    },
  };
}

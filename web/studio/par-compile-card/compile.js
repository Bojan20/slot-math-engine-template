/* slot-math · Compile-from-PAR card · auto-emitted Studio driver.
   Drag-drop PAR + game/variant/tier picker → POST /api/compile (or
   show CLI fallback) → pipeline progress + Merkle attestation result.
*/
(function () {
  const dropZone = document.getElementById('drop');
  const fileInput = document.getElementById('file-input');
  const gameInput = document.getElementById('game-id');
  const variantInput = document.getElementById('variant-id');
  const tierSelect = document.getElementById('mc-tier');
  const skinSelect = document.getElementById('skin-select');
  const compileBtn = document.getElementById('compile-btn');
  const logEl = document.getElementById('log');

  let selectedFile = null;

  function setStep(step, status) {
    const el = document.querySelector(`.pipeline-step[data-step="${step}"]`);
    if (!el) return;
    el.classList.remove('active', 'done', 'fail');
    el.classList.add(status);
    const icon = el.querySelector('.step-icon');
    icon.textContent = status === 'done' ? '✓' : status === 'fail' ? '✗' : status === 'active' ? '◉' : '○';
    if (status === 'active') {
      el.querySelector('.step-time').textContent = new Date().toLocaleTimeString();
    }
  }

  function log(msg) {
    logEl.textContent += '\n' + msg;
    logEl.scrollTop = logEl.scrollHeight;
  }

  function checkReady() {
    compileBtn.disabled = !(selectedFile && gameInput.value && variantInput.value);
  }

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) {
      selectedFile = e.dataTransfer.files[0];
      dropZone.innerHTML = `📎 ${selectedFile.name}<br/><small>${(selectedFile.size / 1024).toFixed(1)} KB</small>`;
      checkReady();
    }
  });
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
      selectedFile = e.target.files[0];
      dropZone.innerHTML = `📎 ${selectedFile.name}<br/><small>${(selectedFile.size / 1024).toFixed(1)} KB</small>`;
      checkReady();
    }
  });
  gameInput.addEventListener('input', checkReady);
  variantInput.addEventListener('input', checkReady);

  compileBtn.addEventListener('click', async () => {
    const game = gameInput.value;
    const variant = variantInput.value;
    const tier = tierSelect.value;
    const skin = skinSelect.value;

    logEl.textContent = `[${new Date().toISOString()}] Starting compile pipeline`;
    compileBtn.disabled = true;
    document.querySelectorAll('.pipeline-step').forEach((el) => {
      el.classList.remove('active', 'done', 'fail');
      el.querySelector('.step-icon').textContent = '○';
    });

    try {
      // Try backend
      setStep('normalize', 'active');
      const form = new FormData();
      form.append('par_file', selectedFile);
      form.append('game', game);
      form.append('variant', variant);
      form.append('tier', tier);
      if (skin) form.append('skin', skin);

      const res = await fetch('/api/compile', { method: 'POST', body: form });
      if (!res.ok) throw new Error(`backend ${res.status}`);
      const result = await res.json();

      // Walk pipeline steps from result
      ['normalize', 'ir', 'mc', 'deploy', 'attest'].forEach((step) => {
        setStep(step, result.steps?.[step]?.status === 'pass' ? 'done' : 'fail');
        if (result.steps?.[step]?.log) log(result.steps[step].log);
      });
      log(`\n✓ deploy_signature: ${result.deploy_signature?.slice(0, 16)}...`);
    } catch (err) {
      log(`✗ ${err.message}`);
      log(`\n--- CLI fallback ---`);
      log(`slot-math par add ${game} --variant ${variant}=${selectedFile.name}`);
      log(`slot-math ir build ${game} ${variant}`);
      log(`slot-math mc run ${game} ${variant} --tier ${tier}`);
      log(`slot-math deploy ${game} ${variant}${skin ? ' --skin ' + skin : ''}`);
      setStep('normalize', 'fail');
    } finally {
      compileBtn.disabled = false;
    }
  });
})();

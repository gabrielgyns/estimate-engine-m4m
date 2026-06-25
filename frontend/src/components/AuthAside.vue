<script setup lang="ts">
// Decorative brand panel for the auth pages. Pure presentation.
</script>

<template>
  <aside class="aside">
    <div class="glowA" aria-hidden="true" />
    <div class="glowB" aria-hidden="true" />

    <div class="top">
      <span class="mark" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 13.5 10.5 7l4 4L20 5.5"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <circle cx="20" cy="5.5" r="1.8" fill="currentColor" />
        </svg>
      </span>
      <span class="wordmark">Estimate<span class="accent">Engine</span></span>
    </div>

    <div class="middle">
      <h2>
        Orçamentos de limpeza,<br />
        <span class="hl">calculados na hora.</span>
      </h2>
      <p>
        Configure seus preços uma vez e gere estimativas precisas para cada
        lead — multi-organização, do primeiro contato ao fechamento.
      </p>

      <ul class="points">
        <li>
          <span class="dot" />Engine de preço como fonte da verdade
        </li>
        <li><span class="dot" />Catálogo de add-ons configurável</li>
        <li><span class="dot" />Cálculo ao vivo, sem retrabalho</li>
      </ul>
    </div>

    <p class="foot">House cleaning · lead-to-quote</p>
  </aside>
</template>

<style scoped>
.aside {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 2.6rem 2.8rem;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent 30%),
    var(--sidebar);
  border-right: 1px solid var(--border);
}
.glowA,
.glowB {
  position: absolute;
  border-radius: 50%;
  filter: blur(70px);
  pointer-events: none;
}
.glowA {
  width: 460px;
  height: 460px;
  top: -160px;
  left: -120px;
  background: radial-gradient(circle, rgba(62, 207, 142, 0.12), transparent 70%);
}
.glowB {
  width: 420px;
  height: 420px;
  bottom: -160px;
  right: -130px;
  background: radial-gradient(circle, rgba(45, 212, 167, 0.08), transparent 70%);
}

.top {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.65rem;
}
.mark {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 11px;
  color: var(--accent-ink);
  background: linear-gradient(150deg, var(--accent), var(--accent-2));
  box-shadow: 0 10px 26px -10px var(--accent-glow);
}
.wordmark {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 1.3rem;
  letter-spacing: -0.02em;
}
.wordmark .accent {
  color: var(--accent);
}

.middle {
  position: relative;
  max-width: 30ch;
  animation: rise 0.6s ease both;
}
h2 {
  font-size: clamp(1.8rem, 3vw, 2.5rem);
  line-height: 1.1;
}
.hl {
  color: var(--accent);
}
.middle p {
  margin: 1.1rem 0 1.7rem;
  color: var(--text-muted);
  font-size: 0.98rem;
  line-height: 1.6;
}
.points {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
.points li {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.9rem;
  color: var(--text);
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 12px var(--accent-glow);
}
.foot {
  position: relative;
  margin: 0;
  font-size: 0.76rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-dim);
}

@media (max-width: 860px) {
  .aside {
    display: none;
  }
}
</style>

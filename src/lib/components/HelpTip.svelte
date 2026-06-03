<script lang="ts">
  interface Props {
    text: string;
    learnMore?: string;
  }

  let { text, learnMore }: Props = $props();

  let isOpen = $state(false);
  let button = $state<HTMLButtonElement | null>(null);
  let popover = $state<HTMLDivElement | null>(null);

  function toggle() {
    isOpen = !isOpen;
  }

  function close() {
    isOpen = false;
  }

  function handleClickOutside(event: MouseEvent) {
    if (
      isOpen &&
      button &&
      popover &&
      !button.contains(event.target as Node) &&
      !popover.contains(event.target as Node)
    ) {
      close();
    }
  }

  function handleEscape(event: KeyboardEvent) {
    if (event.key === 'Escape' && isOpen) {
      close();
    }
  }

  $effect(() => {
    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
      };
    }
  });
</script>

<div class="help-tip-container">
  <button
    bind:this={button}
    class="help-tip-button"
    onclick={toggle}
    type="button"
    aria-label="Help"
  >
    ?
  </button>

  {#if isOpen}
    <div bind:this={popover} class="help-tip-popover">
      <p class="help-tip-text">{text}</p>
      {#if learnMore}
        <a href={learnMore} target="_blank" rel="noopener noreferrer" class="help-tip-learn-more">
          Learn more →
        </a>
      {/if}
    </div>
  {/if}
</div>

<style>
  .help-tip-container {
    position: relative;
    display: inline-block;
  }

  .help-tip-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    min-width: 48px;
    min-height: 48px;
    padding: 10px;
    border: 1px solid var(--color-border, #3a3a3a);
    border-radius: 50%;
    background: var(--color-bg-secondary, #1a1a1a);
    color: var(--color-text-secondary, #a0a0a0);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .help-tip-button:hover {
    background: var(--color-bg-tertiary, #2a2a2a);
    color: var(--color-text-primary, #ffffff);
    border-color: var(--color-border-hover, #4a4a4a);
  }

  .help-tip-popover {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    width: 280px;
    max-width: 90vw;
    padding: 12px;
    background: var(--color-bg-secondary, #1e293b);
    border: 1px solid var(--color-border, #3a3a3a);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    z-index: 1000;
  }

  .help-tip-popover::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 6px solid transparent;
    border-top-color: var(--color-bg-secondary, #1e293b);
  }

  .help-tip-text {
    margin: 0;
    color: var(--color-text-primary, #e2e8f0);
    font-size: 14px;
    line-height: 1.5;
  }

  .help-tip-learn-more {
    display: inline-block;
    margin-top: 8px;
    color: var(--color-primary, #60a5fa);
    font-size: 13px;
    text-decoration: none;
  }

  .help-tip-learn-more:hover {
    text-decoration: underline;
  }

  @media (max-width: 640px) {
    .help-tip-popover {
      width: 260px;
    }
  }
</style>

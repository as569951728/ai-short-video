<template>
  <a-layout class="admin-layout">
    <a-layout-sider class="admin-sider" width="224">
      <div class="admin-logo">AI 短视频小说</div>
      <slot name="sider" />
    </a-layout-sider>
    <a-layout>
      <a-layout-header class="admin-header">
        <slot name="header" />
      </a-layout-header>
      <a-layout-content class="admin-content">
        <slot />
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>


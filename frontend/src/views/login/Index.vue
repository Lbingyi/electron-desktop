<template>
  <div class="login-page">
    <div class="login-container">
      <div class="info-container">
<!--        <h2>Swimming pool in summertime</h2>-->
<!--        <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>-->
        <div ref="animationContainer" class="animation"></div>
      </div>

      <div class="login-form">
        <div class="logo">
          <h1 class="hero-title">
            <span class="gradient-text">LOGIN</span>
          </h1>
        </div>
        <div class="input-container">
          <el-input v-model="form.machineCode" placeholder="本机机器码" readonly>
            <template #append>
              <el-button  size="large" @click="copyMachineCode" :icon="DocumentCopy" />
            </template>
          </el-input>
        </div>
<!--        <a href="#" class="forgot-password">I forgot my password ?</a>-->
        <el-button type="primary" @click="handleLogin" :loading="submitLoading" class="login-button">登录</el-button>
      </div>


    </div>
  </div>
</template>

<script setup>
import lottie from "lottie-web";
import animationData from "@/assets/json/bg.json";
import Notification from "@/utils/notification";
import {encrypt} from "@/utils/rsaEncrypt";
import {post} from "@/utils/request";
import {ipc} from "@/utils/ipcRenderer";

import { DocumentCopy } from '@element-plus/icons-vue'
import {onMounted, reactive, ref} from 'vue';


const submitLoading = ref(false)

const animationContainer = ref(null);

onMounted(() => {
  lottie.loadAnimation({
    container: animationContainer.value, // 动画容器
    renderer: 'svg',
    loop: true,
    autoplay: true,
    animationData: animationData, // 动画数据
  });
});




// 复制机器码功能
const copyMachineCode = ()=>{
  // 创建一个临时文本输入元素
  const tempInput = document.createElement('input');
  tempInput.value = form.machineCode;
  document.body.appendChild(tempInput);
  tempInput.select();
  document.execCommand('copy');
  document.body.removeChild(tempInput);
  // 提示用户复制成功
  Notification.message({ message: '机器码已复制到剪贴板', type: 'success' });
}

// # 定义通信频道，即路由
const ipcApiRoute = {
  getMachineCode: 'controller.login.getMachineCode',
}

onMounted(()=>{
  //初始化机器码
  ipc.invoke(ipcApiRoute.getMachineCode, {}).then(res => {
    if (res.status){
      form.machineCode = res.data.machineCode
    }else {
      Notification.message({ message: '初始化错误请重试', type: 'warning' });
    }
  })
})

const form = reactive({
  machineCode: '',
  line: '',
  agree: false,
  remember: false,
});
const handleLogin = () => {
  // if (!form.agree) {
  //   Notification.message({ message: '请同意用户服务协议', type: 'info' });
  //   return;
  // }
  submitLoading.value = true
  //获取本机唯一机器码
  let oldTimestamp = new Date().getTime().toString();
  let machineCode = form.machineCode
  if (machineCode === '' || machineCode === undefined) {
    Notification.message({ message: '机器码不能为空', type: 'error' });
    submitLoading.value = false
    return;
  }
  let data = {machineCode: machineCode,authCode: '',timestamp: oldTimestamp};

  let jsonData = {timestamp: oldTimestamp,jsonData: encrypt(JSON.stringify(data))};
  post("/authManage/clientAuth",jsonData).then(res => {
    // Fail closed：客户端已彻底移除 RSA 私钥，无法验证授权服务器响应的真实性。
    // 在授权服务器建成、并实现可验证的响应方案（服务端签名、客户端公钥验签）之前，
    // 任何响应都视为不可信，登录一律拒绝。禁止在此恢复 decrypt、或采信未经验证的响应。
    Notification.message({ message: '授权服务未就绪，登录已拒绝', type: 'error' });
    submitLoading.value = false;
  }).catch(error => {
    Notification.message({ message: '授权服务不可达，请稍后重试', type: 'error' });
    submitLoading.value = false
  })
};
</script>

<style scoped>
.login-page {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100vw;
  height: 100vh;
  background-color: #f5f8fa;
}

.login-container {
  display: flex;
  width: 100%;
  height: 100%;
  box-shadow: 0px 10px 20px rgba(0, 0, 0, 0.1);
}

.info-container {
  width: 50%;
  padding: 40px;
  color: white;
  background-color: #2878f0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
}

.info-container h2 {
  font-size: 24px;
  margin-bottom: 10px;
}

.info-container p {
  font-size: 16px;
  text-align: center;
}

.animation {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  overflow: hidden; /* 防止超出容器边界 */
}

.login-form {
  width: 40%;
  padding: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: #ffffff;
  justify-content: center;
}

.logo {
  text-align: center;
  margin-bottom: 20px;
}

.hero-title {
  font-size: 2rem;
  font-weight: 700;
  color: #333;
  margin: 0;
}

.gradient-text {
  font-size: 60px;
  background: linear-gradient(90deg, #f4da0d, #67e76a, rgba(189, 21, 21, 0.99), #119ee2, #fbc2eb);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-subtitle {
  font-size: 1rem;
  color: #666;
  margin-top: 0.5rem;
}

.input-container {
  width: 100%;
  margin-top: 30px;
  display: flex;
  justify-content: center; /* 水平居中对齐 */
}

.input {
  width: 100%;
  padding: 15px;
  margin-bottom: 10px;
  border: 1px solid #ddd;
  border-radius: 5px;
  outline: none;
  font-size: 16px;
}

.forgot-password {
  color: #888;
  font-size: 14px;
  margin-top: 10px;
  text-decoration: none;
}

.login-button {
  margin-top: 20px;
  width: 100%; /* 改成全宽 */
  height: 50px;
  border-radius: 25px; /* 圆角 */
  background-color: #28a745;
  color: white;
  font-size: 16px;
  font-weight: bold;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.3s;
}

.login-button:hover {
  background-color: #218838; /* 悬停效果 */
}
</style>

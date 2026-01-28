#!/usr/bin/env node

/**
 * FreeSWITCH IP 自动更新脚本
 *
 * 功能：
 * 1. 自动检测本机 IP 地址（支持 192.x 或 10.x 开头的局域网 IP）
 * 2. 批量更新所有相关配置文件
 * 3. 支持备份功能
 * 4. 自动重启 Docker 容器
 * 5. 验证配置是否生效
 *
 * 使用方法：
 *   node scripts/update-ip.js              # 自动检测并更新
 *   node scripts/update-ip.js 192.168.1.100 # 指定 IP 更新
 *   node scripts/update-ip.js --dry-run     # 预览模式，不实际修改
 *   node scripts/update-ip.js --no-restart  # 只更新配置，不重启容器
 */

import { execSync, spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// 需要更新的配置文件列表
const CONFIG_FILES = [
  {
    path: 'freeswitch/conf/vars.xml',
    patterns: [
      { search: /<X-PRE-PROCESS cmd="set" data="domain=\d+\.\d+\.\d+\.\d+"\/>/, template: (ip) => `<X-PRE-PROCESS cmd="set" data="domain=${ip}"/>` },
      { search: /<X-PRE-PROCESS cmd="set" data="external_rtp_ip=\d+\.\d+\.\d+\.\d+"\/>/, template: (ip) => `<X-PRE-PROCESS cmd="set" data="external_rtp_ip=${ip}"/>` },
      { search: /<X-PRE-PROCESS cmd="set" data="external_sip_ip=\d+\.\d+\.\d+\.\d+"\/>/, template: (ip) => `<X-PRE-PROCESS cmd="set" data="external_sip_ip=${ip}"/>` },
    ]
  },
  {
    path: 'freeswitch/conf/sip_profiles/internal.xml',
    patterns: [
      { search: /<param name="ext-rtp-ip" value="\d+\.\d+\.\d+\.\d+"\/>/, template: (ip) => `<param name="ext-rtp-ip" value="${ip}"/>` },
      { search: /<param name="ext-sip-ip" value="\d+\.\d+\.\d+\.\d+"\/>/, template: (ip) => `<param name="ext-sip-ip" value="${ip}"/>` },
      { search: /<param name="force-register-domain" value="\d+\.\d+\.\d+\.\d+"\/>/, template: (ip) => `<param name="force-register-domain" value="${ip}"/>` },
      { search: /<param name="force-register-db-domain" value="\d+\.\d+\.\d+\.\d+"\/>/, template: (ip) => `<param name="force-register-db-domain" value="${ip}"/>` },
      { search: /<param name="challenge-realm" value="\d+\.\d+\.\d+\.\d+"\/>/, template: (ip) => `<param name="challenge-realm" value="${ip}"/>` },
      // 注释中的 IP
      { search: /so it applies ext-rtp-ip \(\d+\.\d+\.\d+\.\d+\) instead/, template: (ip) => `so it applies ext-rtp-ip (${ip}) instead` },
    ]
  },
  {
    path: 'freeswitch/conf/directory/default.xml',
    patterns: [
      { search: /<alias name="\d+\.\d+\.\d+\.\d+"\/>/, template: (ip) => `<alias name="${ip}"/>` },
    ]
  },
  {
    path: 'src/store/useCallStore.ts',
    patterns: [
      { search: /const sipDomain = '\d+\.\d+\.\d+\.\d+';/, template: (ip) => `const sipDomain = '${ip}';` },
      { search: /server: 'wss:\/\/\d+\.\d+\.\d+\.\d+:8443'/, template: (ip) => `server: 'wss://${ip}:8443'` },
    ]
  },
  {
    path: 'nginx_proxy/nginx.conf',
    patterns: [
      { search: /server_name \d+\.\d+\.\d+\.\d+;/, template: (ip) => `server_name ${ip};` },
    ]
  },
];

/**
 * 获取本机局域网 IP 地址
 * 支持 192.x 或 10.x 开头的 IP
 */
function getLocalIP() {
  try {
    const output = execSync('ifconfig', { encoding: 'utf-8' });
    // 匹配 192.x.x.x 或 10.x.x.x 格式的 IP
    const match = output.match(/inet (192\.|10\.)\d+\.\d+\.\d+\.\d+/);
    if (match) {
      return match[0].replace('inet ', '');
    }
  } catch (e) {
    // macOS ifconfig 失败，尝试 ipconfig
    try {
      const output = execSync('ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1', { encoding: 'utf-8' });
      const ip = output.trim();
      if (ip && /^(192\.|10\.)/.test(ip)) {
        return ip;
      }
    } catch (e2) {
      console.error('无法获取本机 IP 地址');
      process.exit(1);
    }
  }
  return null;
}

/**
 * 备份文件
 */
function backupFile(filePath) {
  const backupPath = `${filePath}.backup`;
  if (existsSync(filePath)) {
    const content = readFileSync(filePath, 'utf-8');
    writeFileSync(backupPath, content, 'utf-8');
    console.log(`  已备份: ${backupPath}`);
  }
}

/**
 * 更新文件中的 IP
 */
function updateFile(config, newIP, dryRun = false) {
  const filePath = join(PROJECT_ROOT, config.path);

  if (!existsSync(filePath)) {
    console.log(`  跳过（文件不存在）: ${config.path}`);
    return { updated: false, exists: false };
  }

  let content = readFileSync(filePath, 'utf-8');
  let modified = false;

  for (const pattern of config.patterns) {
    // 使用全局替换（replaceAll 或 g 标志）来处理文件中的所有匹配项
    const globalRegex = new RegExp(pattern.search.source, pattern.search.flags + 'g');
    const newContent = content.replaceAll(globalRegex, pattern.template(newIP));
    if (newContent !== content) {
      modified = true;
      content = newContent;
    }
  }

  if (modified) {
    if (dryRun) {
      console.log(`  [预览] ${config.path}`);
      // 显示将要替换的 IP
      for (const pattern of config.patterns) {
        const matches = content.match(pattern.search);
        if (matches) {
          console.log(`    ${matches[0]} => ${pattern.template(newIP)}`);
        }
      }
      return { updated: true, exists: true };
    } else {
      backupFile(filePath);
      writeFileSync(filePath, content, 'utf-8');
      console.log(`  已更新: ${config.path}`);
      return { updated: true, exists: true };
    }
  } else {
    console.log(`  跳过（无需更新）: ${config.path}`);
    return { updated: false, exists: true };
  }
}

/**
 * 执行 docker-compose 命令
 */
function dockerCompose(command, silent = false) {
  try {
    const output = execSync(`docker-compose ${command}`, {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      stdio: silent ? 'pipe' : 'inherit'
    });
    return output?.trim() || '';
  } catch (e) {
    throw new Error(`docker-compose ${command} 失败: ${e.message}`);
  }
}

/**
 * 重启 FreeSWITCH 容器
 */
async function restartFreeSWITCH(expectedIP) {
  console.log('\n正在重启 FreeSWITCH 容器...');

  // 检查容器是否在运行
  try {
    const status = dockerCompose('ps freeswitch', true);
    if (!status.includes('voip-freeswitch')) {
      console.error('错误: FreeSWITCH 容器未运行');
      console.log('请先启动容器: docker-compose up -d');
      return false;
    }
  } catch (e) {
    console.error(`错误: ${e.message}`);
    return false;
  }

  // 完全停止并启动容器（restart 不会重新处理 X-PRE-PROCESS）
  console.log('停止容器...');
  dockerCompose('stop freeswitch');
  console.log('启动容器...');
  dockerCompose('start freeswitch');
  console.log('容器已启动，等待服务启动...');

  // 等待容器启动
  await sleep(5000);

  // 验证 IP 是否正确
  console.log('\n验证 IP 配置...');
  return verifyIPConfig(expectedIP);
}

/**
 * 验证 FreeSWITCH 中的 IP 配置
 */
function verifyIPConfig(expectedIP) {
  try {
    const output = dockerCompose('exec -T freeswitch fs_cli -x "sofia status profile internal"', true);

    const extRtpMatch = output.match(/Ext-RTP-IP\s+(\d+\.\d+\.\d+\.\d+)/);
    const extSipMatch = output.match(/Ext-SIP-IP\s+(\d+\.\d+\.\d+\.\d+)/);

    const extRtpIP = extRtpMatch ? extRtpMatch[1] : null;
    const extSipIP = extSipMatch ? extSipMatch[1] : null;

    console.log(`  Ext-RTP-IP: ${extRtpIP}`);
    console.log(`  Ext-SIP-IP: ${extSipIP}`);

    if (extRtpIP === expectedIP && extSipIP === expectedIP) {
      console.log(`\n IP 配置验证成功！`);
      return true;
    } else {
      console.log(`\n IP 配置验证失败！`);
      console.log(`  期望 IP: ${expectedIP}`);
      console.log(`  实际 Ext-RTP-IP: ${extRtpIP}`);
      console.log(`  实际 Ext-SIP-IP: ${extSipIP}`);
      console.log(`\n提示: 配置文件可能未正确挂载到容器中，请检查 docker-compose.yml 的 volume 配置`);
      return false;
    }
  } catch (e) {
    console.error(`验证失败: ${e.message}`);
    return false;
  }
}

/**
 * 延时函数
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const noRestart = args.includes('--no-restart');
  const manualIP = args.find(arg => !arg.startsWith('-') && /^(192\.|10\.)/.test(arg));

  let newIP = manualIP;

  if (!newIP) {
    console.log('正在检测本机 IP 地址...');
    newIP = getLocalIP();
    if (!newIP) {
      console.error('无法自动检测局域网 IP，请手动指定：');
      console.error('  node scripts/update-ip.js <IP地址>');
      process.exit(1);
    }
  }

  console.log(`\n${dryRun ? '[预览模式]' : ''}将使用 IP 地址: ${newIP}\n`);
  console.log('正在更新配置文件...\n');

  let hasUpdates = false;
  for (const config of CONFIG_FILES) {
    console.log(`处理: ${config.path}`);
    const result = updateFile(config, newIP, dryRun);
    if (result.updated) hasUpdates = true;
  }

  if (dryRun) {
    console.log('\n[预览模式] 未实际修改文件');
    return;
  }

  console.log('\n配置文件更新完成！');

  if (!noRestart) {
    const success = await restartFreeSWITCH(newIP);
    if (success) {
      console.log('\n IP 更新并重启成功！');
      console.log('\n现在可以进行通话测试了。');
    } else {
      console.log('\n IP 更新完成，但容器配置验证失败。');
      console.log('请检查 docker-compose.yml 中的 volume 配置。');
    }
  } else {
    console.log('\n提示：使用了 --no-restart 参数，请手动重启容器：');
    console.log('  docker-compose restart freeswitch');
  }
}

main();

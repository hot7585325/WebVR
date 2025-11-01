/**
 * A-Frame GLTF Interactive Component
 * 用於 GLTF 模型的 Mesh 偵測與互動
 */

AFRAME.registerComponent('gltf-interactive', {
  schema: {
    // 可互動的 Mesh 名稱（用逗號分隔）
    interactiveMeshes: { type: 'string', default: '' },
    // 懸停時的顏色
    hoverColor: { type: 'color', default: '#FF6B6B' },
    // 點擊時的顏色
    clickColor: { type: 'color', default: '#4ECDC4' },
    // 正常狀態的顏色
    normalColor: { type: 'color', default: '#FFFFFF' },
    // 是否顯示所有 Mesh 名稱（Debug 用）
    debug: { type: 'boolean', default: true }
  },

  init: function () {
    this.meshes = []; // 儲存所有 mesh
    this.interactiveMeshObjects = []; // 儲存可互動的 mesh
    this.originalColors = new Map(); // 儲存原始顏色
    this.hoveredMesh = null; // 當前懸停的 mesh
    
    // 等待模型載入
    this.el.addEventListener('model-loaded', this.onModelLoaded.bind(this));
  },

  onModelLoaded: function () {
    console.log('模型已載入:', this.el.id);
    
    // 獲取所有 mesh
    this.getAllMeshes();
    
    // 設置可互動的 mesh
    this.setupInteractiveMeshes();
    
    // Debug 模式：顯示所有 mesh 名稱
    if (this.data.debug) {
      this.displayMeshNames();
    }
  },

  /**
   * 遞迴獲取所有 Mesh
   */
  getAllMeshes: function () {
    this.meshes = [];
    const object3D = this.el.object3D;
    
    object3D.traverse((node) => {
      if (node.isMesh) {
        this.meshes.push({
          name: node.name || 'Unnamed',
          mesh: node,
          parent: node.parent ? node.parent.name : 'Root'
        });
        console.log('找到 Mesh:', node.name || 'Unnamed', node);
      }
    });
    
    console.log(`總共找到 ${this.meshes.length} 個 Mesh`);
    return this.meshes;
  },

  /**
   * 設置可互動的 Mesh
   */
  setupInteractiveMeshes: function () {
    const interactiveNames = this.data.interactiveMeshes
      .split(',')
      .map(name => name.trim())
      .filter(name => name.length > 0);
    
    console.log('可互動的 Mesh 名稱:', interactiveNames);
    
    this.interactiveMeshObjects = [];
    
    // 如果沒有指定名稱，則所有 mesh 都可互動
    if (interactiveNames.length === 0) {
      this.interactiveMeshObjects = this.meshes.map(m => m.mesh);
      console.log('所有 Mesh 都設為可互動');
    } else {
      // 只選擇指定名稱的 mesh
      this.meshes.forEach(meshInfo => {
        if (interactiveNames.includes(meshInfo.name)) {
          this.interactiveMeshObjects.push(meshInfo.mesh);
          console.log('設置互動 Mesh:', meshInfo.name);
        }
      });
    }
    
    // 為可互動的 mesh 添加 class（重要！）
    this.interactiveMeshObjects.forEach(mesh => {
      // 儲存原始顏色
      if (mesh.material) {
        const originalColor = mesh.material.color ? mesh.material.color.clone() : null;
        this.originalColors.set(mesh, originalColor);
      }
      
      // 關鍵修正：正確添加 class 供 raycaster 偵測
      if (!mesh.classList) {
        mesh.classList = new Set();
      }
      if (mesh.classList instanceof Set) {
        mesh.classList.add('interactive-mesh');
      } else {
        // 相容舊版瀏覽器
        mesh.className = 'interactive-mesh';
      }
      
      console.log('Mesh 已添加 interactive-mesh class:', mesh.name);
    });
    
    // 確保 raycaster 能偵測到這些 mesh
    this.updateRaycasterObjects();
    
    // 設置事件監聽
    this.setupEventListeners();
  },

  /**
   * 更新 Raycaster 的偵測物件
   */
  updateRaycasterObjects: function () {
    // 將可互動的 mesh 加入到場景的 raycaster 系統
    const scene = this.el.sceneEl;
    
    // 等待場景完全載入
    if (scene.hasLoaded) {
      this.configureRaycaster();
    } else {
      scene.addEventListener('loaded', () => {
        this.configureRaycaster();
      });
    }
  },

  configureRaycaster: function () {
    const cursor = document.querySelector('a-cursor');
    if (cursor) {
      const raycaster = cursor.components.raycaster;
      if (raycaster) {
        // 確保 raycaster 能偵測到我們的 mesh
        raycaster.refreshObjects();
        console.log('Raycaster 已更新');
      }
    }
  },

  /**
   * 設置事件監聽器
   */
  setupEventListeners: function () {
    const self = this;
    
    // 使用 raycaster-intersected 和 raycaster-intersected-cleared 事件
    this.interactiveMeshObjects.forEach(mesh => {
      // 為每個 mesh 創建一個代理 entity（如果還沒有）
      if (!mesh.el) {
        const proxyEntity = document.createElement('a-entity');
        proxyEntity.object3D.add(mesh);
        this.el.appendChild(proxyEntity);
        mesh.el = proxyEntity;
      }
    });

    // 監聽整個 entity 的 raycaster 事件
    this.el.addEventListener('raycaster-intersected', (evt) => {
      const intersection = evt.detail.intersection;
      if (intersection && intersection.object) {
        const mesh = intersection.object;
        if (this.interactiveMeshObjects.includes(mesh)) {
          this.onHoverEnter(mesh);
        }
      }
    });

    this.el.addEventListener('raycaster-intersected-cleared', (evt) => {
      this.onHoverLeave();
    });

    // 點擊事件
    this.el.addEventListener('click', (evt) => {
      if (evt.detail && evt.detail.intersection) {
        this.onClick(evt.detail.intersection);
      }
    });
  },

  /**
   * 滑鼠進入事件
   */
  onHoverEnter: function (mesh) {
    if (this.hoveredMesh !== mesh) {
      // 先恢復之前的 mesh
      if (this.hoveredMesh) {
        this.restoreMeshColor(this.hoveredMesh);
      }
      
      this.hoveredMesh = mesh;
      this.changeMeshColor(mesh, this.data.hoverColor);
      console.log('懸停 Mesh:', mesh.name);
      
      // 發送自訂事件
      this.el.emit('mesh-hover-enter', { mesh: mesh, name: mesh.name });
    }
  },

  /**
   * 滑鼠離開事件
   */
  onHoverLeave: function () {
    if (this.hoveredMesh) {
      this.restoreMeshColor(this.hoveredMesh);
      console.log('離開 Mesh:', this.hoveredMesh.name);
      
      // 發送自訂事件
      this.el.emit('mesh-hover-leave', { mesh: this.hoveredMesh, name: this.hoveredMesh.name });
      
      this.hoveredMesh = null;
    }
  },

  /**
   * 點擊事件
   */
  onClick: function (intersection) {
    if (!intersection || !intersection.object) return;
    
    const mesh = intersection.object;
    
    if (this.interactiveMeshObjects.includes(mesh)) {
      console.log('點擊 Mesh:', mesh.name);
      
      // 改變顏色
      this.changeMeshColor(mesh, this.data.clickColor);
      
      // 0.3 秒後恢復顏色
      setTimeout(() => {
        if (this.hoveredMesh === mesh) {
          this.changeMeshColor(mesh, this.data.hoverColor);
        } else {
          this.restoreMeshColor(mesh);
        }
      }, 300);
      
      // 發送自訂事件
      this.el.emit('mesh-clicked', { 
        mesh: mesh, 
        name: mesh.name,
        point: intersection.point 
      });
    }
  },

  /**
   * 改變 Mesh 顏色
   */
  changeMeshColor: function (mesh, color) {
    if (mesh.material) {
      const threeColor = new THREE.Color(color);
      
      // 處理不同類型的材質
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(mat => {
          if (mat.color) {
            mat.color.copy(threeColor);
            mat.needsUpdate = true;
          }
        });
      } else {
        if (mesh.material.color) {
          mesh.material.color.copy(threeColor);
          mesh.material.needsUpdate = true;
        }
      }
    }
  },

  /**
   * 恢復 Mesh 原始顏色
   */
  restoreMeshColor: function (mesh) {
    const originalColor = this.originalColors.get(mesh);
    if (originalColor && mesh.material) {
      // 處理不同類型的材質
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(mat => {
          if (mat.color) {
            mat.color.copy(originalColor);
            mat.needsUpdate = true;
          }
        });
      } else {
        if (mesh.material.color) {
          mesh.material.color.copy(originalColor);
          mesh.material.needsUpdate = true;
        }
      }
    }
  },

  /**
   * 顯示所有 Mesh 名稱（Debug 用）
   */
  displayMeshNames: function () {
    const meshNamesDiv = document.getElementById('mesh-names');
    if (!meshNamesDiv) return;
    
    let html = `<strong>模型: ${this.el.id}</strong><br>`;
    html += `總共 ${this.meshes.length} 個 Mesh:<br><br>`;
    
    this.meshes.forEach((meshInfo, index) => {
      const isInteractive = this.interactiveMeshObjects.includes(meshInfo.mesh);
      const status = isInteractive ? '✅ 可互動' : '⚪ 不可互動';
      html += `${index + 1}. <span style="color: ${isInteractive ? '#4ECDC4' : '#999'}">${meshInfo.name}</span> ${status}<br>`;
    });
    
    meshNamesDiv.innerHTML = html;
  },

  /**
   * 更新組件參數時觸發
   */
  update: function (oldData) {
    // 如果 interactiveMeshes 改變，重新設置
    if (oldData.interactiveMeshes !== this.data.interactiveMeshes) {
      if (this.meshes.length > 0) {
        this.setupInteractiveMeshes();
      }
    }
  },

  /**
   * 公開方法：取得所有 Mesh 名稱
   */
  getMeshNames: function () {
    return this.meshes.map(m => m.name);
  },

  /**
   * 公開方法：取得指定名稱的 Mesh
   */
  getMeshByName: function (name) {
    const meshInfo = this.meshes.find(m => m.name === name);
    return meshInfo ? meshInfo.mesh : null;
  },

  /**
   * 公開方法：設定可互動的 Mesh
   */
  setInteractiveMeshes: function (names) {
    this.data.interactiveMeshes = Array.isArray(names) ? names.join(',') : names;
    this.setupInteractiveMeshes();
  }
});
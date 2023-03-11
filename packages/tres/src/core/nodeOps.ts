import { useCamera, useRaycaster, useRenderLoop } from '/@/composables'
import { RendererOptions } from 'vue'
import { useLogger } from '../iternal'
import { catalogue } from './catalogue'
import { Mesh } from 'three'
import { useEventListener } from '@vueuse/core'

const { logWarning } = useLogger()

function hasEvents(obj) {
  for (var prop in obj) {
    if (prop.indexOf('on') === 0) {
      return true
    }
  }
  return false
}

export const nodeOps: RendererOptions<Node, Element> = {
  createElement(type, _isSVG, _isCustomizedBuiltIn, props) {
    if (type === 'template') return null
    let instance

    if (props === null) {
      props = {}
    }

    if (props.arg) {
      instance = new catalogue[type.replace('Tres', '')](...props.args)
    } else {
      instance = new catalogue[type.replace('Tres', '')]()
    }

    if (instance.isCamera) {
      // Let users know that camera is in the center of the scene
      logWarning(
        // eslint-disable-next-line max-len
        'Camera is positioned at the center of the scene, if this is not intentional try setting a position if your scene seems empty 🤗',
      )
      const { pushCamera } = useCamera()
      pushCamera(instance)
    }

    if (props.attach === undefined) {
      if (instance.isMaterial) instance.attach = 'material'
      else if (instance.isBufferGeometry) instance.attach = 'geometry'
    }

    console.log({
      type,
      instance,
      threeObj: catalogue[type.replace('Tres', '')],
    })

    return instance
  },
  insert(child, parent, beforeChild) {
    if (parent?.isObject3D && child?.isObject3D) {
      const index = beforeChild ? parent.children.indexOf(beforeChild) : 0
      child.parent = parent
      parent.children.splice(index, 0, child)
      child.dispatchEvent({ type: 'added' })
    } else if (typeof child?.attach === 'string') {
      child.__previousAttach = child[parent.attach]
      parent[child.attach] = child
    }

    const { onLoop } = useRenderLoop()

    // RayCasting
    let prevInstance: TresEvent | null = null
    let currentInstance: TresEvent | null = null

    const { raycaster } = useRaycaster()
    if (child && child instanceof Mesh && hasEvents(child)) {
      onLoop(() => {
        if (parent.children && child && raycaster) {
          const intersects = raycaster.value.intersectObjects(parent.children)

          if (intersects.length > 0 && intersects[0].object.uuid === child.uuid) {
            currentInstance = intersects[0]

            if (prevInstance === null || prevInstance.object.uuid !== currentInstance?.object.uuid) {
              child.onPointerEnter?.(currentInstance)
            }

            child.onPointerMove?.(currentInstance)
          } else {
            currentInstance = null
            if (prevInstance !== null) {
              child.onPointerLeave?.(prevInstance)
            }
          }

          prevInstance = currentInstance
        }
      })

      useEventListener(window, 'click', () => {
        if (currentInstance === null) return
        child.onClick?.(currentInstance)
      })
    }
  },
  remove(node) {
    const parent = node.parent
    if (parent) {
      if (parent.isObject3D && node.isObject3D) {
        parent.remove(node)
      } else if (typeof child.attach === 'string') {
        parent[child.attach] = child.__previousAttach
        delete child.__previousAttach
        node.parent = null
      }
    }

    node.dispose?.()
    node.traverse?.(node => node.dispose?.())
  },
  patchProp(node, prop, prevValue, nextValue) {
    let root = node
    let key = prop
    let target = root[key]

    // Traverse pierced props (e.g. foo-bar=value => foo.bar = value)
    if (key.includes('-')) {
      const chain = key.split('-')
      target = chain.reduce((acc, key) => acc[key], root)
      key = chain.pop()

      if (!target?.set) root = chain.reduce((acc, key) => acc[key], root)
    }

    let value = nextValue
    /*   try {
      const num = parseFloat(value)
      value = isNaN(num) ? value : num
    } catch (_) {} */

    // Set prop, prefer atomic methods if applicable
    if (!target?.set) root[key] = value
    else if (target.constructor === value.constructor) target.copy(value)
    else if (Array.isArray(value)) target.set(...value)
    else if (!target.isColor && target.setScalar) target.setScalar(value)
    else target.set(value)
  },
  createText(text) {},
  createComment(text) {},
  setText(node, text) {},
  setElementText(node, text) {},
  parentNode(node) {
    return node?.parent || null
  },
  nextSibling(node) {
    if (node?.parent?.children) {
      const index = node.parent.children.indexOf(node)
      if (index !== -1) return node.parent.children[index + 1]
    }
    return null
  },
}

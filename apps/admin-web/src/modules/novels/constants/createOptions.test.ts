import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  HOTSPOT_SOURCE_UNAVAILABLE_REASON,
  NOVEL_CREATION_SOURCE_OPTIONS,
} from './createOptions'

describe('novel creation source options', () => {
  it('keeps hotspot reference disabled with a visible unavailable reason', () => {
    const hotspotOption = NOVEL_CREATION_SOURCE_OPTIONS.find((option) => option.value === 'hotspot_reference')

    assert.equal(hotspotOption?.label, '引用热点')
    assert.equal(hotspotOption?.disabled, true)
    assert.equal(hotspotOption?.reason, HOTSPOT_SOURCE_UNAVAILABLE_REASON)
    assert.match(HOTSPOT_SOURCE_UNAVAILABLE_REASON, /暂无可用热点数据|热点引用能力/)
    assert.match(HOTSPOT_SOURCE_UNAVAILABLE_REASON, /不能选择/)
    assert.doesNotMatch(HOTSPOT_SOURCE_UNAVAILABLE_REASON, /热点管理已实现|创建热点/)
  })
})

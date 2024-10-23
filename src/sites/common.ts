import { AllSubject, SearchResult, SingleInfo } from '../interface/subject';
import { IAuxPrefs } from '../interface/types';
import {
  CharaModel,
  InfoConfig,
  ModelKey,
  Selector,
  SiteConfig,
} from '../interface/wiki';
import { findModelByHost } from '../models';
import {
  clearCtxDom,
  findElement,
  getInnerText,
  getText,
  htmlToElement,
  setCtxDom,
} from '../utils/domUtils';
import { fetchText } from '../utils/fetchData';
import { dealTextByPipe } from '../utils/textPipe';
import { isEqualDate } from '../utils/utils';
import { dealFuncByCategory, getCharaHooks, getHooks } from './index';
import { getCover } from './lib';

/**
 * 处理单项 wiki 信息
 * @param str
 * @param category
 * @param keyWords
 */
export function dealItemText(
  str: string,
  category: string = '',
  keyWords: string[] = []
): string {
  const separators = [':', '：'];
  if (['subject_summary', 'subject_title'].indexOf(category) !== -1) {
    return str;
  }
  const textList = ['\\(.*?\\)', '（.*?）']; // 去掉多余的括号信息
  // const keyStr = keyWords.sort((a, b) => b.length - a.length).join('|')
  // `(${keyStr})(${separators.join('|')})?`
  return str
    .replace(new RegExp(textList.join('|'), 'g'), '')
    .replace(
      new RegExp(keyWords.map((k) => `${k}\s*?(:|：)?`).join('|'), 'g'),
      ''
    )
    .replace(/[^\d:]+?(:|：)/, '')
    .trim();
}

export async function getWikiItem(infoConfig: InfoConfig, site: ModelKey) {
  if (!infoConfig) return;
  const sl = infoConfig.selector;
  let $d: Element;
  let targetSelector: Selector;
  if (sl instanceof Array) {
    let i = 0;
    targetSelector = sl[i];
    while (!($d = findElement(targetSelector)) && i < sl.length) {
      targetSelector = sl[++i];
    }
  } else {
    targetSelector = sl;
    $d = findElement(targetSelector);
  }
  if (!$d) return;
  let keyWords: string[];
  if (targetSelector.keyWord instanceof Array) {
    keyWords = targetSelector.keyWord;
  } else {
    keyWords = [targetSelector.keyWord];
  }
  let val: any;
  let txt = getText($d as HTMLElement);
  if (infoConfig.pipes?.includes('ti')) {
    txt = getInnerText($d as any)
  }
  const pipeArgsDict = {
    k: [keyWords],
  };
  switch (infoConfig.category) {
    case 'cover':
    case 'crt_cover':
      val = await getCover($d, site);
      break;
    case 'subject_summary':
      // 优先使用 innerText
      const innerTxt = getInnerText($d as HTMLElement);
      if (innerTxt) {
        txt = innerTxt;
      }
    case 'alias':
    case 'subject_title':
      // 有管道优先使用管道处理数据. 兼容之前使用写法
      if (infoConfig.pipes) {
        val = dealTextByPipe(txt, infoConfig.pipes, pipeArgsDict);
      } else {
        val = dealFuncByCategory(site, infoConfig.category)(txt);
      }
      break;
    case 'website':
      val = dealFuncByCategory(site, 'website')($d.getAttribute('href'));
      break;
    case 'date':
      // 有管道优先使用管道处理数据. 兼容之前使用写法
      if (infoConfig.pipes) {
        val = dealTextByPipe(txt, infoConfig.pipes, pipeArgsDict);
      } else {
        // 日期预处理，不能删除
        val = dealItemText(txt, infoConfig.category, keyWords);
        val = dealFuncByCategory(site, infoConfig.category)(val);
      }
      break;
    default:
      // 有管道优先使用管道处理数据. 兼容之前使用写法
      if (infoConfig.pipes) {
        val = dealTextByPipe(txt, infoConfig.pipes, pipeArgsDict);
      } else {
        val = dealItemText(txt, infoConfig.category, keyWords);
      }
  }
  // 信息后处理
  if (infoConfig.category === 'creator') {
    val = val.replace(/\s/g, '');
  }
  if (val) {
    return {
      name: infoConfig.name,
      value: val,
      category: infoConfig.category,
    } as SingleInfo;
  }
}

export async function getWikiData(siteConfig: SiteConfig, el?: Document) {
  el ? setCtxDom(el) : clearCtxDom();
  const r = await Promise.all(
    siteConfig.itemList.map((item) => getWikiItem(item, siteConfig.key))
  );
  clearCtxDom();
  const defaultInfos = siteConfig.defaultInfos || [];
  let rawInfo = r.filter((i) => i);
  const hookRes = await getHooks(siteConfig, 'afterGetWikiData')(
    rawInfo,
    siteConfig
  );
  if (Array.isArray(hookRes) && hookRes.length) {
    rawInfo = hookRes;
  }
  return [...rawInfo, ...defaultInfos];
}

export async function getCharaData(model: CharaModel, el?: Document | Element) {
  el ? setCtxDom(el) : clearCtxDom();
  const r = await Promise.all(
    model.itemList.map((item) => getWikiItem(item, model.key))
  );
  clearCtxDom();
  const defaultInfos = model.defaultInfos || [];
  let rawInfo = r.filter((i) => i);
  const hookRes = await getCharaHooks(model, 'afterGetWikiData')(
    rawInfo,
    model,
    el
  );
  if (Array.isArray(hookRes) && hookRes.length) {
    rawInfo = hookRes;
  }
  return [...rawInfo, ...defaultInfos];
}

/**
 * 过滤搜索结果： 通过名称以及日期
 * @param items
 * @param subjectInfo
 * @param opts
 */
export function filterResults(
  items: SearchResult[],
  subjectInfo: AllSubject,
  opts: any = {},
  isSearch: boolean = true
) {
  if (!items) return;
  // 只有一个结果时直接返回, 不再比较日期
  if (items.length === 1 && isSearch) {
    const result = items[0];
    return result;
    // if (isEqualDate(result.releaseDate, subjectInfo.releaseDate)) {
    // }
  }
  let results = new Fuse(items, Object.assign({}, opts)).search(
    subjectInfo.name
  );
  if (!results.length) return;
  // 有参考的发布时间
  if (subjectInfo.releaseDate) {
    for (const item of results) {
      const result = item.item;
      if (result.releaseDate) {
        if (isEqualDate(result.releaseDate, subjectInfo.releaseDate)) {
          return result;
        }
      }
    }
  }
  // 比较名称
  const nameRe = new RegExp(subjectInfo.name.trim());
  for (const item of results) {
    const result = item.item;
    if (nameRe.test(result.name) || nameRe.test(result.greyName)) {
      return result;
    }
  }
  return results[0]?.item;
}

export function getQueryInfo(items: SingleInfo[]): any {
  let info: any = {};
  items.forEach((item) => {
    if (item.category === 'subject_title') {
      info.name = item.value;
    }
    if (item.category === 'date') {
      info.releaseDate = item.value;
    }
    if (item.category === 'ASIN') {
      info.asin = item.value;
    }
    if (item.category === 'ISBN') {
      info.isbn = item.value;
    }
  });
  return info;
}

/**
 * 插入控制的按钮
 * @param $t 父节点
 * @param cb 返回 Promise 的回调
 */
export function insertControlBtn(
  $t: Element,
  cb: (...args: any) => Promise<any>
) {
  if (!$t) return;
  const $div = document.createElement('div');
  const $s = document.createElement('span');
  $s.classList.add('e-wiki-new-subject');
  $s.innerHTML = '新建';
  const $search = $s.cloneNode() as Element;
  $search.innerHTML = '新建并查重';
  $div.appendChild($s);
  $div.appendChild($search);
  $t.insertAdjacentElement('afterend', $div);
  $s.addEventListener('click', async (e) => {
    await cb(e);
  });
  $search.addEventListener('click', async (e) => {
    if ($search.innerHTML !== '新建并查重') return;
    $search.innerHTML = '查重中...';
    try {
      await cb(e, true);
      $search.innerHTML = '新建并查重';
    } catch (e) {
      if (e === 'notmatched') {
        $search.innerHTML = '未查到条目';
      }
      console.error(e);
    }
  });
}

/**
 * 插入新建角色控制的按钮
 * @param $t 父节点
 * @param cb 返回 Promise 的回调
 */
export function insertControlBtnChara(
  $t: Element,
  cb: (...args: any) => Promise<any>
) {
  if (!$t) return;
  const $div = document.createElement('div');
  const $s = document.createElement('a');
  $s.classList.add('e-wiki-new-character');
  // $s.setAttribute('target', '_blank')
  $s.innerHTML = '添加新虚拟角色';
  $div.appendChild($s);
  $t.insertAdjacentElement('afterend', $div);
  $s.addEventListener('click', async (e) => {
    await cb(e);
  });
}

export function addCharaUI(
  $t: Element,
  names: string[],
  cb: (...args: any) => Promise<any>
) {
  if (!$t) return;
  if (!names.length) {
    console.warn('没有虚拟角色可用');
    return
  };
  // @TODO 增加全部
  // <option value="all">全部</option>
  const btn = `<a class="e-wiki-new-character">添加新虚拟角色</a>`;
  const $div = htmlToElement(`
  <div class="e-bnwh-add-chara-wrap">
  ${btn}
<select class="e-bnwh-select">
${names.map((n) => `<option value="${n}">${n}</option>`)}
</select>
  </div>
  `) as Element;
  $t.insertAdjacentElement('afterend', $div);
  $div
    .querySelector('.e-wiki-new-character')
    .addEventListener('click', async (e) => {
      // 获取下拉选项
      const $sel = $div.querySelector('.e-bnwh-select') as HTMLSelectElement;
      const val = $sel.value;
      await cb(e, val);
    });
}

function isChineseStr(str: string) {
  return /^[\u4e00-\u9fa5]+/i.test(str) && !hasJpStr(str);
}
function hasJpStr(str: string) {
  var pHiragana = /[\u3040-\u309Fー]/;
  var pKatakana = /[\u30A0-\u30FF]/;
  return pHiragana.test(str) || pKatakana.test(str);
}
function getTargetStr(
  str1: string,
  str2: string,
  checkFunc: (str: string) => boolean
): string {
  if (checkFunc(str1)) return str1;
  if (checkFunc(str2)) return str2;
  return '';
}
// 综合两个单项信息
function combineObj(
  current: SingleInfo,
  target: SingleInfo,
  auxPrefs: IAuxPrefs = {}
): SingleInfo[] {
  if (
    auxPrefs.originNames === 'all' ||
    (auxPrefs.originNames && auxPrefs.originNames.includes(current.name))
  ) {
    return [{ ...current }];
  } else if (
    auxPrefs.targetNames === 'all' ||
    (auxPrefs.targetNames && auxPrefs.targetNames.includes(target.name))
  ) {
    return [{ ...target }];
  }
  const obj = { ...current, ...target };
  if (current.category === 'subject_title') {
    // 中日  日英  中英
    let cnName = { name: '中文名', value: '' };
    let titleObj = { ...current };
    let otherName = { name: '别名', value: '', category: 'alias' };
    let chineseStr = getTargetStr(current.value, target.value, isChineseStr);
    let jpStr = getTargetStr(current.value, target.value, hasJpStr);
    // TODO 状态机？
    if (chineseStr) {
      cnName.value = chineseStr;
      if (current.value === chineseStr) {
        titleObj.value = target.value;
      } else {
        titleObj.value = current.value;
      }
    }
    if (jpStr) {
      titleObj.value = jpStr;
      if (!chineseStr) {
        if (current.value === jpStr) {
          otherName.value = target.value;
        } else {
          otherName.value = current.value;
        }
      }
    }
    return [titleObj, cnName, otherName];
  }
  if (['游戏简介', '开发', '发行'].includes(current.name)) {
    return [{ ...current }];
  }
  if (current.value.length < target.value.length) {
    obj.value = target.value;
  } else {
    obj.value = current.value;
  }
  return [obj];
}

/**
 * 结合不用网站的信息
 * @param infoList 当前的条目信息
 * @param otherInfoList 参考的条目信息
 */
export function combineInfoList(
  infoList: SingleInfo[],
  otherInfoList: SingleInfo[],
  auxPrefs: IAuxPrefs = {}
): SingleInfo[] {
  // 合并数组为空时
  if (!otherInfoList || !otherInfoList.length) {
    return infoList;
  }
  if (!infoList || !infoList.length) {
    return otherInfoList;
  }
  const multipleNames: string[] = ['平台', '别名'];
  const { targetNames = [], originNames = [] } = auxPrefs;
  const res: SingleInfo[] = [];
  const idxSetOther = new Set();
  for (let i = 0; i < infoList.length; i++) {
    const current = infoList[i];
    const targetFirst: boolean = targetNames.includes(current.name);
    if (targetFirst) {
      continue;
    } else if (!targetFirst && multipleNames.includes(current.name)) {
      res.push(current);
      continue;
    }
    const idxOther = otherInfoList.findIndex(
      (info) => info.name === current.name
    );
    if (idxOther === -1) {
      res.push(current);
    } else {
      const objArr = combineObj(current, otherInfoList[idxOther], auxPrefs);
      res.push(...objArr);
      idxSetOther.add(idxOther);
    }
  }
  for (let j = 0; j < otherInfoList.length; j++) {
    const other = otherInfoList[j];
    const originFirst: boolean = originNames.includes(other.name);
    if (originFirst) {
      continue;
    } else if (!originFirst && multipleNames.includes(other.name)) {
      res.push(other);
      continue;
    }
    if (idxSetOther.has(j)) continue;
    res.push(other);
  }
  const noEmptyArr = res.filter((v) => v.value);
  // ref: https://stackoverflow.com/questions/2218999/remove-duplicates-from-an-array-of-objects-in-javascript
  return noEmptyArr
    .filter(
      (v, i, a) =>
        a.findIndex((t) => t.value === v.value && t.name === v.name) === i
    )
    .filter((v, i, a) => {
      if (v.name !== '别名') return true;
      else {
        return a.findIndex((t) => t.value === v.value) === i;
      }
    });
}

// 后台抓取其它网站的 wiki 信息
export async function getWikiDataByURL(url: string, opts: any = {}) {
  const urlObj = new URL(url);
  const models = findModelByHost(urlObj.hostname);
  if (models && models.length) {
    const rawText = await fetchText(url, opts, 4 * 1000);
    let $doc = new DOMParser().parseFromString(rawText, 'text/html');
    let model = models[0];
    if (models.length > 1) {
      for (const m of models) {
        if (m.urlRules && m.urlRules.some((r) => r.test(url))) {
          model = m;
        }
      }
    }
    try {
      // 查找标志性的元素
      const $page = findElement(model.pageSelectors, $doc as any);
      if (!$page) return [];
      const $title = findElement(model.controlSelector, $doc as any);
      if (!$title) return [];
      return await getWikiData(model, $doc);
    } catch (error) {
      return [];
    }
  }
  return [];
}

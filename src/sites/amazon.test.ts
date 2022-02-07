import { amazonUtils } from './amazon';

describe('test amazon function', function () {
  it('deal title text', function () {
    const dealTitle = amazonUtils.dealTitle;
    // str = document.querySelector('#productTitle').textContent
    expect(dealTitle(`BADON (1) (ビッグガンガンコミックス)`)).toEqual(
      'BADON (1)'
    );
    expect(dealTitle(`幾日 (WANIMAGAZINE COMICS SPECIAL)`)).toEqual('幾日');
    expect(dealTitle(`幾日 (WANIMAGAZINE COMICS SPECIAL) (1)`)).toEqual(
      '幾日 (WANIMAGAZINE COMICS SPECIAL) (1)'
    );
    expect(
      dealTitle(`
                大蜘蛛ちゃんフラッシュ・バック(2) (アフタヌーンKC)
            `)
    ).toEqual('大蜘蛛ちゃんフラッシュ・バック(2)');

    expect(
      dealTitle(
        '動物のおしゃべり　（１） (バンブーコミックス 4コマセレクション)'
      )
    ).toEqual('動物のおしゃべり　（１）');
  });
});

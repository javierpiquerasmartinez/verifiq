import type { InlineImage } from './mailer.js';

/**
 * The app's BrandMark (apps/web/src/ui/icons.tsx) as an 84 px PNG, shown at 28 px. Email clients
 * drop SVG, so it travels inline with each email instead.
 */
export const LOGO: InlineImage = {
  contentId: 'verifiq-logo',
  filename: 'verifiq.png',
  content: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAFQAAABUCAYAAAAcaxDBAAACnElEQVR42u2dsU7DMBCG8wKW+gC8AYtnps7dETNMDJ3pWhZGuiExhaEbj8AQxAtUqsSIxBuUobvxiSCVqEkc+2Jfwn/SL1VV1cqfHN/vS3POsoBQs4up1dKqsNpYmYFqU46BxjLNYob9QW2VW+0GDLBNu3KMum+QxYgh1qlgBWu/bGK1+ocgqyIGE45ZuQHMP2utDoG5A8Sj66sGzFRQAZMRapmAsGZ2W1MnTUCRzT2yf9OlDkB+0seAFgDjb/4xO/ucpeW+FVDClB8ChU1isFGHJTgA4dE0K2uAgMGjJbI7d7bHzoh355QBAq8AFEABFEAhAAXQmDqb35i37bv5DXpN7wGoh04v5+ZrvzfVoPdOzq8AtIsI2Pbj09TF4vEJQLlgUtytnwHUVeuXV9MWmKGMMLGGOopmnQtMZHkHXd8/GJeYLW7hQ9tEkFyCoMPYOxj3Y14zRhIaHdA6414NSlTYejJ4zZgwBw3UFSZ9pg97NDqgLl4zNszBAnU17rS+jqJ812e5LLVxjw6ULrG6clnoICUY9+hAm2ZQCFQpxj06UCqJcV+Okoy7qBnqA1WacRezhvpAlWjck2X5UKhSjXsyHxoKVapxT2rsfaFKNu7Jd0pdoUo37iK2nl2gSjfuYvbyrlClG3dRxZFQqBKMu7hqky9USV5TXPmuK9ShwExaD3WFKtFrii0wt0EdGkwRFfs6qFKN+yBugcT8QyzuKQEogAIEgAIogEL+QPF4N/Pj3WhAwNyAAC0ymFtkoIkLZxMXtBlibjOERlhsytGqjVcazQQ5szvaXfY4O9GQNUgrtAxm3Bmptt72Ck2tnW2SQqfwBDABtQeYOLqicc3UOFyFKZur0MNVcPzPj2lXEc5VyhUOqOoFLo5Qq8Q3Jj6pk9gZUGoAAAAASUVORK5CYII=',
    'base64',
  ),
};

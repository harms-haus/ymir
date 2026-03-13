import { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

export {
  render,
  screen,
  waitFor,
  within,
  fireEvent,
  act,
  queryByTestId,
  queryAllByTestId,
  getByTestId,
  getAllByTestId,
  cleanup,
} from '@testing-library/react';

export { userEvent };

interface CustomRenderOptions extends RenderOptions {
  initialState?: Record<string, unknown>;
  initialWorkspaces?: unknown[];
}

export function renderWithStore(
  ui: ReactElement,
  options: CustomRenderOptions = {}
): ReturnType<typeof render> {
  const { initialState, initialWorkspaces, ...renderOptions } = options;

  const rendered = render(ui, renderOptions);

  return rendered;
}

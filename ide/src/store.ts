import { createStore } from 'redux';
import ideApp from './reducer';
import { EditorMode, CHUNKSEP, State } from './state';
import {
  newId,
  Chunk,
} from './chunk';
import { Action } from './action';
import { RunKind } from './backend';
import * as control from './control';

type Dispatch = (action: Action) => void;

let currentRunner: any;

function handleStartEditTimer(dispatch: Dispatch, editTimer: NodeJS.Timer | false) {
  if (editTimer) {
    clearTimeout(editTimer);
  }

  dispatch({
    type: 'effectEnded',
    status: 'succeeded',
    effect: 'startEditTimer',
    timer: setTimeout(() => {
      dispatch({
        type: 'effectEnded',
        status: 'succeeded',
        effect: 'editTimer',
      });
    }, 200),
  });
}

function handleLoadFile(
  dispatch: Dispatch,
  currentFile: string,
  editorMode: EditorMode,
) {
  const contents = control.openOrCreateFile(currentFile);

  switch (editorMode) {
    case EditorMode.Text:
      dispatch({ type: 'update', key: 'currentFileContents', value: contents });
      break;
    case EditorMode.Chunks: {
      const chunkStrings = contents.split(CHUNKSEP);
      let totalLines = 0;
      const chunks = chunkStrings.map((chunkString) => {
        const chunk = {
          text: chunkString,
          startLine: totalLines,
          editor: undefined,
          id: newId(),
        };

        totalLines += chunkString.split('\n').length;

        return chunk;
      });

      dispatch({ type: 'update', key: 'chunks', value: chunks });
      break;
    }
    default:
  }

  dispatch({
    type: 'effectEnded',
    status: 'succeeded',
    effect: 'loadFile',
  });
}

function handleSetupWorkerMessageHandler(dispatch: Dispatch) {
  function handleLog(message: string): void {
    console.log(message);
  }

  function handleSetupFinished(): void {
    dispatch({
      type: 'effectEnded',
      status: 'succeeded',
      effect: 'setup',
    });
  }

  function handleCompileFailure(errors: string[]): void {
    dispatch({
      type: 'effectEnded',
      status: 'failed',
      effect: 'compile',
      errors,
    });
  }

  function handleRuntimeFailure(errors: string[]): void {
    dispatch({
      type: 'effectEnded',
      status: 'failed',
      effect: 'run',
      errors,
    });
  }

  function handleLintFailure(lintFailure: { name: string, errors: string[] }): void {
    dispatch({
      type: 'effectEnded',
      status: 'failed',
      effect: 'lint',
      name: lintFailure.name,
      errors: lintFailure.errors,
    });
  }

  function handleLintSuccess(lintSuccess: { name: string }): void {
    dispatch({
      type: 'effectEnded',
      status: 'succeeded',
      effect: 'lint',
      name: lintSuccess.name,
    });
  }

  function handleCompileSuccess(): void {
    dispatch({
      type: 'effectEnded',
      status: 'succeeded',
      effect: 'compile',
    });
  }

  function handleCreateReplSuccess(): void {
    dispatch({
      type: 'effectEnded',
      status: 'succeeded',
      effect: 'createRepl',
    });
  }

  function handleCompileInteractionSuccess(): void {
    console.log('compile interaction success (nyi)');
  }

  function handleCompileInteractionFailure(): void {
    console.log('compile interaction failure (nyi)');
  }

  control.setupWorkerMessageHandler(
    handleLog,
    handleSetupFinished,
    handleCompileFailure,
    handleRuntimeFailure,
    handleLintFailure,
    handleLintSuccess,
    handleCompileSuccess,
    handleCreateReplSuccess,
    handleCompileInteractionSuccess,
    handleCompileInteractionFailure,
  );

  dispatch({
    type: 'effectEnded',
    status: 'succeeded',
    effect: 'setupWorkerMessageHandler',
  });
}

function handleCreateRepl() {
  control.createRepl();
}

function handleSaveFile(
  dispatch: Dispatch,
  mode: EditorMode,
  path: string,
  contents: string,
  chunks: Chunk[],
) {
  switch (mode) {
    case EditorMode.Text:
      control.fs.writeFileSync(path, contents);
      break;
    case EditorMode.Chunks:
      control.fs.writeFileSync(
        path,
        chunks.map((chunk) => chunk.text).join(CHUNKSEP),
      );
      break;
    default:
      throw new Error('handleSaveFile: unknown editor mode');
  }

  dispatch({
    type: 'effectEnded',
    status: 'succeeded',
    effect: 'saveFile',
  });
}

function handleCompile(dispatch: Dispatch, path: string, typeCheck: boolean) {
  const { dir, base } = control.bfsSetup.path.parse(path);
  control.compile(dir, base, typeCheck);
}

function handleRun(dispatch: Dispatch, runKind: RunKind) {
  const { runBase, runProgram } = control.path;
  control.run(
    runBase,
    runProgram,
    (runResult: any) => {
      console.log('runResult', runResult);
      if (runResult.result.error === undefined) {
        dispatch({
          type: 'effectEnded',
          status: 'succeeded',
          effect: 'run',
          result: runResult,
        });
      } else {
        dispatch({
          type: 'effectEnded',
          status: 'failed',
          effect: 'run',
          errors: runResult.result.result,
        });
      }
    },
    (runner: any) => {
      currentRunner = runner;
    },
    runKind,
  );
}

function handleStop(dispatch: Dispatch) {
  currentRunner.pause((line: number) => {
    dispatch({
      type: 'effectEnded',
      status: 'succeeded',
      effect: 'stop',
      line,
    });
  });
}

function handleFirstActionableEffect(
  state: State,
  dispatch: Dispatch,
): false | { effect: number, applyEffect: () => void } {
  const { effectQueue } = state;

  for (let i = 0; i < effectQueue.length; i += 1) {
    const effect = effectQueue[i];

    switch (effect) {
      case 'startEditTimer': {
        const { editTimer } = state;
        return {
          effect: i,
          applyEffect: () => handleStartEditTimer(dispatch, editTimer),
        };
      }
      case 'loadFile':
        {
          console.log('loadFile');
          const { currentFile, editorMode } = state;
          if (currentFile !== undefined) {
            return {
              effect: i,
              applyEffect: () => handleLoadFile(dispatch, currentFile, editorMode),
            };
          }
        }
        break;
      case 'saveFile':
        {
          const {
            editorMode, currentFile, currentFileContents, chunks,
          } = state;
          console.log('saveFile, contents=', currentFileContents);
          if (currentFile !== undefined && currentFileContents !== undefined) {
            return {
              effect: i,
              applyEffect: () => handleSaveFile(
                dispatch,
                editorMode,
                currentFile,
                currentFileContents,
                chunks,
              ),
            };
          }
        }
        break;
      case 'setupWorkerMessageHandler':
        {
          console.log('setupWorkerMessageHandler');
          const { isMessageHandlerReady } = state;
          if (!isMessageHandlerReady) {
            return {
              effect: i,
              applyEffect: () => handleSetupWorkerMessageHandler(dispatch),
            };
          }
        }
        break;
      case 'createRepl':
        {
          console.log('createRepl');
          const { isReplReady } = state;
          if (!isReplReady) {
            return {
              effect: i,
              applyEffect: () => handleCreateRepl(),
            };
          }
        }
        break;
      case 'lint':
        console.log('applyFirstActionableEffect: warning: lint effect ignored (nyi)');
        return {
          effect: i,
          applyEffect: () => { },
        };
      case 'compile':
        {
          console.log('compile');
          const {
            currentFile,
            typeCheck,
            isMessageHandlerReady,
            isSetupFinished,
            compiling,
            running,
            isFileSaved,
          } = state;
          if (isMessageHandlerReady && isSetupFinished && isFileSaved && !compiling && !running) {
            return {
              effect: i,
              applyEffect: () => handleCompile(dispatch, currentFile, typeCheck),
            };
          }
        }
        break;
      case 'run': {
        console.log('run');
        const {
          runKind,
          isMessageHandlerReady,
          isSetupFinished,
          compiling,
          running,
        } = state;
        if (isMessageHandlerReady && isSetupFinished && !compiling && !running) {
          return {
            effect: i,
            applyEffect: () => handleRun(dispatch, runKind),
          };
        }
        break;
      }
      case 'stop': {
        const { running } = state;
        if (running && currentRunner !== undefined) {
          return {
            effect: i,
            applyEffect: () => handleStop(dispatch),
          };
        }

        return {
          effect: i,
          applyEffect: () => { },
        };
      }
      default:
        throw new Error('getFirstActionableEffect: unknown effect');
    }
  }

  return false;
}

const store = createStore(
  ideApp,
  (window as any).__REDUX_DEVTOOLS_EXTENSION__ && (window as any).__REDUX_DEVTOOLS_EXTENSION__(),
);

store.subscribe(() => {
  const state = store.getState();

  const { dispatch } = store;

  const maybeEffect = handleFirstActionableEffect(state, dispatch);

  if (!maybeEffect) {
    return;
  }

  const { effect, applyEffect } = maybeEffect;

  dispatch({ type: 'effectStarted', effect });
  applyEffect();
});

store.dispatch({ type: 'enqueueEffect', effect: 'setupWorkerMessageHandler' });
store.dispatch({ type: 'enqueueEffect', effect: 'loadFile' });

export default store;

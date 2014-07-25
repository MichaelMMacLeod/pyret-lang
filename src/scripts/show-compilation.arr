#lang pyret

import cmdline as C
import parse-pyret as P
import "compiler/desugar.arr" as D
import "compiler/desugar-check.arr" as DC
import ast as A
import "compiler/compile.arr" as CM
import "compiler/compile-structs.arr" as CS
import "compiler/resolve-scope.arr" as R
import "compiler/ast-util.arr" as U
import "compiler/ast-anf.arr" as AN
import "compiler/anf.arr" as N
import "compiler/js-of-pyret.arr" as JS
import "compiler/desugar-check.arr" as CH
import file as F

options = {
  width: C.next-val-default(C.Number, 80, some("w"), C.once, "Pretty-printed width"),
  dialect: C.next-val-default(C.String, "Pyret", some("d"), C.once, "Dialect to use"),
  standard-builtins: C.flag(C.once, "Use standard buildins instead of minimal builtins"),
  check-mode: C.flag(C.once, "Compile code with check-mode enabled")
}

parsed-options = C.parse-cmdline(options)

cases (C.ParsedArguments) parsed-options:
  | success(opts, rest) =>
    print-width = opts.get("width")
    dialect = opts.get("dialect")
    libs = if opts.has-key("standard-builtins"): CS.standard-builtins else: CS.minimal-builtins end
    check-mode = opts.has-key("check-mode")
    print("Success")
    cases (List) rest:
      | empty => print("Require a file name")
      | link(file, _) =>
        print("File is " + file)
        file-contents = F.file-to-string(file)
        print("")

        comp = CM.compile-js(CM.start, dialect, file-contents, file, libs,
          {check-mode: check-mode, collect-all: true, ignore-unbound: true}).tolist()

        for each(phase from comp):
          print(">>>>>>>>>>>>>>>>>>")
          print(phase.name + ":")
          if A.Program(phase.result): each(print, phase.result.tosource().pretty(print-width))
          else if AN.AProg(phase.result): each(print, phase.result.tosource().pretty(print-width))
          else if JS.CompiledCodePrinter(phase.result): print(phase.result.pyret-to-js-pretty(print-width))
          else if R.NameResolution(phase.result): each(print, phase.result.ast.tosource().pretty(print-width))
          else if CS.CompileResult(phase.result):
            cases(CS.CompileResult) phase.result:
              | ok(c) =>
                if A.Program(c): each(print, c.tosource().pretty(print-width))
                else if JS.CompiledCodePrinter(c): print(c.pyret-to-js-pretty(print-width))
                else:
                  print("Unknown CompileResult result type")
                  print(torepr(c))
                end
              | err(problems) => each(print, problems.map(tostring))
            end
          else:
            print("Unknown phase result type")
            print(torepr(phase.result))
          end
        end
    end
  | arg-error(m, _) =>
    each(print,  ("Error: " + m) ^ link(_, C.usage-info(options)))
end
print("Finished")

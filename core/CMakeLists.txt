cmake_minimum_required(VERSION 3.20)
project(magfem_core C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(POLICY CMP0135)
  cmake_policy(SET CMP0135 NEW)
endif()
include(FetchContent)
FetchContent_Declare(eigen
  URL https://gitlab.com/libeigen/eigen/-/archive/3.4.0/eigen-3.4.0.tar.gz
  URL_HASH SHA256=8586084f71f9bde545ee7fa6d00288b264a2b7ac3607b974e54d13e7162c1c72)
FetchContent_GetProperties(eigen)
if(NOT eigen_POPULATED)
  FetchContent_Populate(eigen)   # só os headers; não roda o CMake do Eigen
endif()

# Tangle (David Meeker, MIT): gerador de malha do FEMM; compilado como biblioteca em mesh_tangle.cpp.
FetchContent_Declare(tangle
  URL https://github.com/dcm3c/tangle/archive/66221c398cd90f06a7beb0c0abf637b269313af3.tar.gz
  URL_HASH SHA256=7b1509b83e4b347acbe868cfbe5d64341017f69a55690e15577487b51fe7912a)
FetchContent_GetProperties(tangle)
if(NOT tangle_POPULATED)
  FetchContent_Populate(tangle)
endif()

add_library(magfem STATIC src/poisson1d.cpp src/mesh2d.cpp src/mesh_tangle.cpp ${tangle_SOURCE_DIR}/float256.cpp src/magstatic.cpp)
target_include_directories(magfem PUBLIC src ${eigen_SOURCE_DIR})
target_include_directories(magfem PRIVATE ${tangle_SOURCE_DIR})
set_source_files_properties(src/mesh_tangle.cpp ${tangle_SOURCE_DIR}/float256.cpp PROPERTIES COMPILE_OPTIONS "-w;-O2")
target_compile_definitions(magfem PUBLIC EIGEN_MPL2_ONLY)

if(EMSCRIPTEN)
  add_executable(core bindings/wasm_api.cpp)
  target_link_libraries(core magfem)
  target_link_options(core PRIVATE
    -lembind
    -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createCore
    -sENVIRONMENT=worker,web
    -sALLOW_MEMORY_GROWTH=1
    -sSTACK_SIZE=8MB)
else()
  enable_testing()
  add_executable(test_poisson1d tests/test_poisson1d.cpp)
  target_link_libraries(test_poisson1d magfem)
  add_test(NAME poisson1d COMMAND test_poisson1d)
  add_executable(test_mesh2d tests/test_mesh2d.cpp)
  target_link_libraries(test_mesh2d magfem)
  add_test(NAME mesh2d COMMAND test_mesh2d)
  add_executable(test_magstatic tests/test_magstatic.cpp)
  target_link_libraries(test_magstatic magfem)
  add_test(NAME magstatic COMMAND test_magstatic)
endif()

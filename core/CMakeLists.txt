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

# Triangle (J. R. Shewchuk) — gerador de malha 2D; uso livre e sem cobrança (ver README do pacote).
FetchContent_Declare(triangle
  URL https://www.netlib.org/voronoi/triangle.zip
  URL_HASH SHA256=1766327add038495fa3499e9b7cc642179229750f7201b94f8e1b7bee76f8480)
FetchContent_GetProperties(triangle)
if(NOT triangle_POPULATED)
  FetchContent_Populate(triangle)
endif()
add_library(triangle STATIC ${triangle_SOURCE_DIR}/triangle.c)
target_compile_definitions(triangle PRIVATE TRILIBRARY ANSI_DECLARATORS NO_TIMER REAL=double)
target_compile_options(triangle PRIVATE -w -O2)
target_include_directories(triangle PUBLIC ${triangle_SOURCE_DIR})

add_library(magfem STATIC src/poisson1d.cpp src/mesh2d.cpp)
target_include_directories(magfem PUBLIC src ${eigen_SOURCE_DIR})
target_compile_definitions(magfem PRIVATE ANSI_DECLARATORS)
target_link_libraries(magfem PUBLIC triangle)
target_compile_definitions(magfem PUBLIC EIGEN_MPL2_ONLY)

if(EMSCRIPTEN)
  add_executable(core bindings/wasm_api.cpp)
  target_link_libraries(core magfem)
  target_link_options(core PRIVATE
    -lembind
    -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createCore
    -sENVIRONMENT=worker,web
    -sALLOW_MEMORY_GROWTH=1)
else()
  enable_testing()
  add_executable(test_poisson1d tests/test_poisson1d.cpp)
  target_link_libraries(test_poisson1d magfem)
  add_test(NAME poisson1d COMMAND test_poisson1d)
  add_executable(test_mesh2d tests/test_mesh2d.cpp)
  target_link_libraries(test_mesh2d magfem)
  add_test(NAME mesh2d COMMAND test_mesh2d)
endif()
